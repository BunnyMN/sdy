/*
 * What the error reporter may collect about a person: nothing it gathers on
 * its own.
 *
 * Two SDK generations say this two ways. @sentry/nextjs 10 has
 * `sendDefaultPii` (default false). 11 removed it for `dataCollection`, whose
 * defaults collect user fields, cookies, headers, query strings and request
 * bodies — so dropping `sendDefaultPii` on the way to 11 would have quietly
 * turned all of it on. Both are given here, and each SDK reads the one it
 * knows and ignores the other.
 *
 * They are spread into `init()` rather than written inline: an object literal
 * naming an option one generation lacks fails its excess-property check, a
 * spread does not, so the same file typechecks against 10 and 11.
 */
export const sentryPrivacy = {
  // @sentry/nextjs 10
  sendDefaultPii: false,
  // @sentry/nextjs 11
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
  },
};
