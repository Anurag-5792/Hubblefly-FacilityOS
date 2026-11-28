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
    "sha256": "3850b35eed972075d4e8ed9f737353d6f56bcb3ecd37a61ddb5267e9c46c7982",
    "definer": true
  },
  "employee_email_register_v1": {
    "args": "text, text, text, bigint, text, text, text, bigint, bigint, text, text",
    "sha256": "1dee0046691028076992149f3a8cbb81ae3c362ebd0a76b4265c4ea4acd7cd80",
    "definer": true
  },
  "employee_email_target_v1": {
    "args": "text, text, text, text, text, bigint, bigint, text",
    "sha256": "9ac8654cb6153dbdf07a7148cc924a1812320cab8148c91e15a73f906508508a",
    "definer": true
  },
  "employee_session_assert_v1": {
    "args": "text, text, text, text, bigint, bigint, text",
    "sha256": "7604ece35ea5d30d9de29b84bd4c5d7ae9df29f48b9d19f25d110501c83d8897",
    "definer": true
  },
  "employee_directory_v1": {
    "args": "text, text, text, text, bigint, bigint, text, text",
    "sha256": "9753600bab2ead74b99c793c3d6b5af3c0bd974d591a2e34b12c24ec67cdee44",
    "definer": true
  },
  "employee_provider_rebind_v1": {
    "args": "text, text, text, bigint, bigint, text, text, text, bigint, bigint, text, text, text",
    "sha256": "7fada1eff115339d701d795f1fd9a96dfd681d46f162470dfb2d7693a577c15c",
    "definer": true
  }
};
