// Extractors whose rejections surface as the JSON `AppError` body, not axum's plain text.

use axum::extract::{FromRequest, FromRequestParts};
use axum::response::{IntoResponse, Response};
use serde::Serialize;

use crate::error::AppError;

#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub(super) struct Json<T>(pub T);

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response {
        axum::Json(self.0).into_response()
    }
}

#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Query), rejection(AppError))]
pub(super) struct Query<T>(pub T);

#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(AppError))]
pub(super) struct Path<T>(pub T);
