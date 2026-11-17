// Package pdfdoctest signs and verifies PDFs the way a test needs to: an
// incremental PAdES signature with a key that exists for one call, and a
// check of every signature in a file against the bytes its /ByteRange names.
//
// It stands in for eID's stamp endpoint in tests, and for a reader such as
// Adobe Acrobat checking the result. Nothing here is trusted by production
// code.
package pdfdoctest

import (
	"bytes"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/hex"
	"fmt"
	"io"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/digitorus/pdf"
	"github.com/digitorus/pdfsign/sign"
	"github.com/digitorus/pkcs7"
)

// AppendSignature adds one signature to in as an incremental revision: an
// approval signature, or with certify a certification that allows no changes.
func AppendSignature(in []byte, name string, certify bool) ([]byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: name, Country: []string{"MN"}, SerialNumber: "PNOMN-TEST"},
		Issuer:       pkix.Name{CommonName: "Test CA"},
		NotBefore:    time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
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
	rdr, err := pdf.NewReader(bytes.NewReader(in), int64(len(in)))
	if err != nil {
		return nil, err
	}
	certType := sign.ApprovalSignature
	if certify {
		certType = sign.CertificationSignature
	}
	var out bytes.Buffer
	if err := sign.Sign(bytes.NewReader(in), &out, rdr, int64(len(in)), sign.SignData{
		Signature: sign.SignDataSignature{
			Info:     sign.SignDataSignatureInfo{Name: name, Reason: "test", Date: time.Now()},
			CertType: certType, DocMDPPerm: sign.DoNotAllowAnyChangesPerms,
		},
		Signer: key, Certificate: cert, DigestAlgorithm: crypto.SHA256,
	}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// Verified is one signature found in a file.
type Verified struct {
	Name  string
	Valid bool
}

var sigDict = regexp.MustCompile(`/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]`)

// Verify checks every signature in data the way a reader does: the bytes its
// /ByteRange names are hashed and checked against the CMS signature in its
// /Contents. A signature broken by a later rewrite is reported invalid.
func Verify(data []byte) ([]Verified, error) {
	var out []Verified
	for _, m := range sigDict.FindAllSubmatch(data, -1) {
		var r [4]int
		for i := range r {
			r[i], _ = strconv.Atoi(string(m[i+1]))
		}
		if r[0] != 0 || r[2]+r[3] > len(data) || r[1] >= r[2] {
			return nil, fmt.Errorf("bad byte range %v", r)
		}
		signed := append(append([]byte(nil), data[r[0]:r[0]+r[1]]...), data[r[2]:r[2]+r[3]]...)
		padded, err := hex.DecodeString(string(bytes.Trim(data[r[1]:r[2]], "<>")))
		if err != nil {
			return nil, err
		}
		// /Contents is zero-padded; the CMS structure is the first DER value.
		var raw asn1.RawValue
		rest, err := asn1.Unmarshal(padded, &raw)
		if err != nil {
			return nil, err
		}
		p7, err := pkcs7.Parse(padded[:len(padded)-len(rest)])
		if err != nil {
			return nil, err
		}
		p7.Content = signed
		v := Verified{Valid: p7.Verify() == nil}
		if signer := p7.GetOnlySigner(); signer != nil {
			v.Name = signer.Subject.CommonName
		}
		out = append(out, v)
	}
	return out, nil
}

var (
	bfchar = regexp.MustCompile(`<([0-9A-F]{4})> <([0-9A-F]{4,8})>`)
	show   = regexp.MustCompile(`/F(\d) [0-9.]+ Tf [-0-9.]+ [-0-9.]+ Td <([0-9A-F]*)> Tj`)
)

// ExtractText reads a pdfdoc file's text back through each font's ToUnicode
// map — what a reader does when somebody searches or copies — independently
// of how the writer chose the glyphs. Text runs are joined with spaces.
func ExtractText(data []byte) (string, error) {
	r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", err
	}
	read := func(v pdf.Value) (string, error) {
		rc := v.Reader()
		defer func() { _ = rc.Close() }()
		b, err := io.ReadAll(rc)
		return string(b), err
	}
	var text strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		maps := map[string]map[string]rune{}
		fonts := page.V.Key("Resources").Key("Font")
		for _, name := range fonts.Keys() {
			cmap, err := read(fonts.Key(name).Key("ToUnicode"))
			if err != nil {
				return "", err
			}
			m := map[string]rune{}
			for _, match := range bfchar.FindAllStringSubmatch(cmap, -1) {
				code, _ := strconv.ParseUint(match[2][:4], 16, 32)
				m[match[1]] = rune(code)
			}
			maps[strings.TrimPrefix(name, "F")] = m
		}
		content, err := read(page.V.Key("Contents"))
		if err != nil {
			return "", err
		}
		for _, match := range show.FindAllStringSubmatch(content, -1) {
			for j := 0; j+4 <= len(match[2]); j += 4 {
				text.WriteRune(maps[match[1]][match[2][j:j+4]])
			}
			text.WriteString(" ")
		}
	}
	return text.String(), nil
}
