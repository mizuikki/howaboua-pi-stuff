use std::collections::BTreeMap;
use std::env;
use std::sync::Arc;

use anyhow::Context;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue, USER_AGENT};

use crate::auth::{CodexAuth, uses_configured_provider_auth};
use crate::cloudflare::CHATGPT_CLOUDFLARE_COOKIE_STORE;
use crate::{DEFAULT_BASE_URL, DEFAULT_ORIGINATOR};

pub fn codex_responses_url() -> String {
    if let Ok(url) = env::var("PI_CODEX_RESPONSES_URL") {
        return url;
    }
    let base = env::var("PI_CODEX_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
    responses_url_from_base(&base)
}

pub fn responses_url_from_base(base: &str) -> String {
    let normalized = base.trim_end_matches('/');
    if normalized.ends_with("/codex/responses") {
        normalized.to_string()
    } else if normalized.ends_with("/api/codex")
        || normalized.ends_with("/backend-api/codex")
        || normalized.ends_with("/codex")
    {
        format!("{normalized}/responses")
    } else if normalized.ends_with("/api") || normalized.ends_with("/backend-api") {
        format!("{normalized}/codex/responses")
    } else {
        format!("{normalized}/api/codex/responses")
    }
}

pub fn headers(auth: &CodexAuth) -> anyhow::Result<HeaderMap> {
    let mut headers = if uses_configured_provider_auth() {
        configured_provider_headers()?
    } else {
        HeaderMap::new()
    };
    headers.insert(
        "Authorization",
        HeaderValue::from_str(&auth.authorization_header()?)?,
    );
    if let Some(account_id) = auth.account_id() {
        headers.insert("ChatGPT-Account-ID", HeaderValue::from_str(account_id)?);
        headers.insert(
            "OpenAI-Beta",
            HeaderValue::from_static("responses=experimental"),
        );
    }
    if auth.is_fedramp_account() {
        headers.insert("X-OpenAI-Fedramp", HeaderValue::from_static("true"));
    }
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    Ok(headers)
}

fn configured_provider_headers() -> anyhow::Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    let Ok(raw) = env::var("PI_CODEX_PROVIDER_HEADERS") else {
        return Ok(headers);
    };
    if raw.trim().is_empty() {
        return Ok(headers);
    }
    let parsed: BTreeMap<String, String> =
        serde_json::from_str(&raw).context("failed to parse PI_CODEX_PROVIDER_HEADERS")?;
    for (key, value) in parsed {
        if key.eq_ignore_ascii_case("authorization") || value.trim().is_empty() {
            continue;
        }
        let name = HeaderName::from_bytes(key.as_bytes())
            .with_context(|| format!("invalid provider header name `{key}`"))?;
        let value = HeaderValue::from_str(&value)
            .with_context(|| format!("invalid provider header value for `{key}`"))?;
        headers.insert(name, value);
    }
    Ok(headers)
}

fn default_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    if uses_configured_provider_auth() {
        return headers;
    }
    let originator = env::var("CODEX_INTERNAL_ORIGINATOR_OVERRIDE")
        .unwrap_or_else(|_| DEFAULT_ORIGINATOR.to_string());
    if let Ok(value) = HeaderValue::from_str(&originator) {
        headers.insert("originator", value);
    } else {
        headers.insert("originator", HeaderValue::from_static(DEFAULT_ORIGINATOR));
    }
    if let Ok(value) = HeaderValue::from_str(&codex_user_agent(&originator)) {
        headers.insert(USER_AGENT, value);
    }
    headers.insert("version", HeaderValue::from_static("0.0.0"));
    headers
}

fn codex_user_agent(originator: &str) -> String {
    let terminal = env::var("TERM_PROGRAM")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            env::var("TERM")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or_else(|| "unknown".to_string());
    let os_info = os_info::get();
    format!(
        "{originator}/0.0.0 ({} {}; {}) {terminal}",
        os_info.os_type(),
        os_info.version(),
        os_info.architecture().unwrap_or("unknown")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn non_provider_auth_ignores_provider_headers_env() {
        let _guard = env_lock().lock().expect("lock env");
        unsafe {
            env::set_var("PI_CODEX_AUTH_MODE", "codex");
            env::set_var("PI_CODEX_PROVIDER_HEADERS", r#"{"X-Custom":"yes"}"#);
        }

        let headers = headers(&CodexAuth::Bearer {
            token: "token".to_string(),
            account_id: Some("account".to_string()),
        })
        .expect("headers should build");

        assert_eq!(headers.get("X-Custom"), None);

        unsafe {
            env::remove_var("PI_CODEX_AUTH_MODE");
            env::remove_var("PI_CODEX_PROVIDER_HEADERS");
        }
    }

    #[test]
    fn provider_auth_includes_provider_headers_env() {
        let _guard = env_lock().lock().expect("lock env");
        unsafe {
            env::set_var("PI_CODEX_AUTH_MODE", "provider");
            env::set_var(
                "PI_CODEX_PROVIDER_HEADERS",
                r#"{"X-Custom":"yes","Authorization":"Bearer ignored"}"#,
            );
        }

        let headers = headers(&CodexAuth::Bearer {
            token: "token".to_string(),
            account_id: None,
        })
        .expect("headers should build");

        assert_eq!(
            headers.get("X-Custom"),
            Some(&HeaderValue::from_static("yes"))
        );
        assert_eq!(headers.get("ChatGPT-Account-ID"), None);

        unsafe {
            env::remove_var("PI_CODEX_AUTH_MODE");
            env::remove_var("PI_CODEX_PROVIDER_HEADERS");
        }
    }
}

pub fn build_codex_http_client() -> anyhow::Result<reqwest::Client> {
    reqwest::Client::builder()
        .default_headers(default_headers())
        .cookie_provider(Arc::clone(&CHATGPT_CLOUDFLARE_COOKIE_STORE))
        .build()
        .context("failed to build web_run HTTP client")
}
