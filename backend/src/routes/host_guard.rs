use std::sync::Arc;

use axum::extract::Request;
use axum::http::header;
use axum::middleware::Next;
use axum::response::Response;

use crate::error::AppError;

// DNS-rebinding guard: the Host (port stripped, case-insensitive) must be allow-listed.
pub(super) async fn check_host(
    hosts: Arc<Vec<String>>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let allowed = req
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .map(host_name)
        .is_some_and(|name| hosts.iter().any(|host| host.eq_ignore_ascii_case(name)));
    if allowed {
        Ok(next.run(req).await)
    } else {
        Err(AppError::Forbidden)
    }
}

// Keeps an IPv6 literal (`[::1]:8080`) intact.
fn host_name(header: &str) -> &str {
    if let Some(rest) = header.strip_prefix('[') {
        return rest.split_once(']').map_or(rest, |(name, _)| name);
    }
    header.split_once(':').map_or(header, |(name, _)| name)
}
