package eidmongolia

import (
	"bytes"
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	pdfread "github.com/digitorus/pdf"
	pdfsign "github.com/digitorus/pdfsign/sign"
)

// The mock rail serves canned ceremonies so the screens, the demo deployment
// and the tests run without a relying-party registration.
//
// It keeps the shape of the real thing — a ceremony that stays running for a
// moment, a four-digit verification code, a terminal completion — because the
// polling UI is the part most likely to be wrong, and a mock that completed
// instantly would never exercise it.
//
// What it cannot fake is the cryptography. The document comes back unchanged:
// no PKCS#7, no certificate chain, no timestamp. A document signed in mock mode
// is a demo artefact, and callers say so rather than presenting it as a
// qualified signature.

// mockApproval is how long a mock ceremony pretends the citizen is reaching for
// their phone.
const mockApproval = 2 * time.Second

type mockState struct {
	RegNo     string `json:"reg_no"`
	FileName  string `json:"file_name"`
	PDFBase64 string `json:"pdf_b64"`
	StartedAt string `json:"started_at"`
	// RailOnly asks the mock for what eID's stamp is expected to return: the
	// document with one signature appended as an incremental revision.
	RailOnly bool `json:"rail_only,omitempty"`
}

const mockPrefix = "mocksign:"

func (s *Service) mockStart(ctx context.Context, in SignRequest) (InitResult, error) {
	id, err := randomHex(16)
	if err != nil {
		return InitResult{}, err
	}
	code, err := randomDigits(4)
	if err != nil {
		return InitResult{}, err
	}

	raw, err := json.Marshal(mockState{
		RegNo:     in.RegNo,
		FileName:  in.FileName,
		PDFBase64: base64.StdEncoding.EncodeToString(in.PDF),
		StartedAt: time.Now().Format(time.RFC3339Nano),
		RailOnly:  in.RailOnly,
	})
	if err != nil {
		return InitResult{}, err
	}
	store := &stateStore{db: s.db}
	if err := store.Set(ctx, mockPrefix+id, string(raw)); err != nil {
		return InitResult{}, err
	}

	sum := sha256.Sum256(in.PDF)
	return InitResult{
		SessionID:        id,
		DocumentHash:     hex.EncodeToString(sum[:]),
		VerificationCode: code,
		Filename:         in.FileName,
		// The phone flow returns straight to the callback: there is no app.
		AppLink: in.CallbackURL,
	}, nil
}

func (s *Service) mockPoll(ctx context.Context, sessionID string) (string, error) {
	state, err := s.loadMock(ctx, sessionID)
	if err != nil {
		// A ceremony nobody can find has effectively expired, which is what the
		// real rail reports for a session eID has reaped.
		return StateExpired, nil //nolint:nilerr // absence is the answer, not a failure
	}
	// An unparseable timestamp is treated as "not yet approved" rather than an
	// error: this is the mock rail, and reporting a parse failure to a caller
	// polling a demo ceremony helps nobody.
	started, parseErr := time.Parse(time.RFC3339Nano, state.StartedAt)
	if parseErr != nil {
		return StateRunning, nil //nolint:nilerr // a demo ceremony keeps waiting rather than erroring
	}
	if time.Since(started) < mockApproval {
		return StateRunning, nil
	}
	return StateCompleted, nil
}

func (s *Service) mockDownload(ctx context.Context, sessionID string) (DownloadResult, error) {
	state, err := s.loadMock(ctx, sessionID)
	if err != nil {
		return DownloadResult{}, err
	}
	started, parseErr := time.Parse(time.RFC3339Nano, state.StartedAt)
	if parseErr != nil || time.Since(started) < mockApproval {
		return DownloadResult{}, errors.New("eidmongolia: the signing ceremony has not completed")
	}
	pdf, err := base64.StdEncoding.DecodeString(state.PDFBase64)
	if err != nil {
		return DownloadResult{}, fmt.Errorf("eidmongolia: decoding the mock document: %w", err)
	}
	if state.RailOnly {
		// What eID's stamp is expected to do, with a throwaway key: append one
		// approval signature and leave the earlier ones intact.
		if pdf, err = mockAppendSignature(pdf); err != nil {
			return DownloadResult{}, err
		}
	}
	return DownloadResult{
		PDF:          pdf,
		Filename:     strings.TrimSuffix(state.FileName, ".pdf") + "-signed.pdf",
		SignerName:   "MOCK SIGNER",
		SignerSerial: "PNOMN-" + state.RegNo,
		SignerIssuer: "Mock eID CA",
	}, nil
}

// mockVerifiedDigest is the digest of the document the mock ceremony holds,
// once it has "completed".
func (s *Service) mockVerifiedDigest(ctx context.Context, sessionID string) (string, error) {
	state, err := s.loadMock(ctx, sessionID)
	if err != nil {
		return "", err
	}
	pdf, err := base64.StdEncoding.DecodeString(state.PDFBase64)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(pdf)
	return base64.StdEncoding.EncodeToString(sum[:]), nil
}

// mockAppendSignature signs the document as an incremental approval
// signature with a key that lives for this call only. Development only.
func mockAppendSignature(in []byte) ([]byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: "MOCK SIGNER", Country: []string{"MN"}},
		NotBefore:    time.Now().Add(-time.Hour), NotAfter: time.Now().AddDate(1, 0, 0),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageContentCommitment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageEmailProtection},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return nil, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}
	reader, err := pdfread.NewReader(bytes.NewReader(in), int64(len(in)))
	if err != nil {
		return nil, fmt.Errorf("eidmongolia: read the mock document: %w", err)
	}
	var out bytes.Buffer
	if err := pdfsign.Sign(bytes.NewReader(in), &out, reader, int64(len(in)), pdfsign.SignData{
		Signature: pdfsign.SignDataSignature{
			Info:     pdfsign.SignDataSignatureInfo{Name: "MOCK SIGNER", Reason: "eID mock", Date: time.Now()},
			CertType: pdfsign.ApprovalSignature,
		},
		Signer: key, Certificate: cert, DigestAlgorithm: crypto.SHA256,
	}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func (s *Service) loadMock(ctx context.Context, sessionID string) (mockState, error) {
	store := &stateStore{db: s.db}
	raw, err := store.Get(ctx, mockPrefix+sessionID)
	if err != nil {
		return mockState{}, err
	}
	var state mockState
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		return mockState{}, fmt.Errorf("eidmongolia: decoding the mock ceremony: %w", err)
	}
	return state, nil
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func randomDigits(n int) (string, error) {
	const digits = "0123456789"
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for i := range buf {
		buf[i] = digits[int(buf[i])%len(digits)]
	}
	return string(buf), nil
}
