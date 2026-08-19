"""Custom application exceptions."""


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, detail=None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(message)


class AuthError(AppError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__("unauthorized", message, 401)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__("forbidden", message, 403)


class NotFoundError(AppError):
    def __init__(self, message: str = "Not found"):
        super().__init__("not_found", message, 404)


class RateLimitError(AppError):
    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__("rate_limited", message, 429)


class PaymentError(AppError):
    def __init__(self, code: str, message: str, detail=None):
        super().__init__(code, message, 400, detail)


class CredentialError(AppError):
    def __init__(self, message: str = "Invalid DevPlay credentials"):
        super().__init__("invalid_credentials", message, 400)


class InsufficientCreditsError(AppError):
    def __init__(self, message: str = "เครดิตหัวใจไม่พอ"):
        super().__init__("insufficient_credits", message, 400)


class MaintenanceError(AppError):
    def __init__(self, message: str = "ระบบปิดปรับปรุงชั่วคราว"):
        super().__init__("maintenance", message, 503)
