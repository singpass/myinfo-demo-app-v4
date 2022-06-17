var config = {
    CLIENT_SECURE_CERT: { type: "String" },
    CLIENT_SECURE_CERT_PASSPHRASE: { type: "String" },
    CLIENT_ID: { type: "String" },
    REDIRECT_URL: { type: "String" },
    SCOPE: { type: "String" },
    AUTHORIZE_JWKS_URL: { type: "String" },
    MYINFO_JWKS_URL: { type: "String" },
    ENVIRONMENT: { type: "String" },
    TOKEN_URL: { type: "String" },
    PERSON_URL: { type: "String" },
    ENABLE_JWE: { type: "String" },
    ENABLE_JWS: { type: "String" },
    USE_PROXY: { type: "String" },
    PROXY_TOKEN_URL: { type: "String" },
    PROXY_PERSON_URL: { type: "String" },
    DEBUG_LEVEL: { type: "String" }
}

module.exports = config;