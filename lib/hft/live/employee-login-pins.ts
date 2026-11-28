/** Exact PostgreSQL prosrc pins for HF101; generated from the guarded SQL candidate. */
export const EMPLOYEE_FUNCTION_PINS:Readonly<Record<string,{args:string;sha256:string;definer:boolean}>>={
  "employee_login_audit_immutable_v1": {
    "args": "",
    "sha256": "b4136984bc538456d0ce26cded727d85ace3671977e84e93e0a1fbeb62d4bb81",
    "definer": false
  },
  "employee_login_context_v1": {
    "args": "text, text, text, text, bigint, bigint",
    "sha256": "60f09abd2701c1dda282ff648a0fe8cd7cf0a58d241a6c02022238bcdebf5d29",
    "definer": true
  },
  "employee_google_claim_v1": {
    "args": "text, text",
    "sha256": "322125b9e795dcd9eac833e14262f0efacdcfc9a5b00a47563dd0af951dcebec",
    "definer": true
  },
  "employee_email_register_v1": {
    "args": "text, text, text, bigint, text, text, text, bigint, bigint, text, text",
    "sha256": "df5eed2bb1d0d3a4318620672e9005488dfa0dc69c6b4bd63d974ff9e307db6b",
    "definer": true
  },
  "employee_email_target_v1": {
    "args": "text, text, text, text, text, bigint, bigint, text",
    "sha256": "b92ecdaddbff3c0e407ba25b52b0bd38dbeeb28832d4b3210612dc9ebb29f044",
    "definer": true
  },
  "employee_session_assert_v1": {
    "args": "text, text, text, text, bigint, bigint, text",
    "sha256": "7604ece35ea5d30d9de29b84bd4c5d7ae9df29f48b9d19f25d110501c83d8897",
    "definer": true
  }
};
