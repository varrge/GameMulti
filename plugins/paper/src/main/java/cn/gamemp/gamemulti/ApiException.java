package cn.gamemp.gamemulti;

final class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    private final boolean retryable;
    private final String requestId;
    private final Long serverTime;
    private final Long retryAfterSeconds;

    ApiException(
            int status,
            String code,
            boolean retryable,
            String requestId,
            Long serverTime,
            Long retryAfterSeconds) {
        super("GameMulti API request failed: HTTP " + status + " (" + safeCode(code) + ")");
        this.status = status;
        this.code = safeCode(code);
        this.retryable = retryable;
        this.requestId = requestId != null && requestId.matches("[A-Za-z0-9-]{1,128}") ? requestId : null;
        this.serverTime = serverTime;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    int status() { return status; }
    String code() { return code; }
    boolean retryable() { return retryable; }
    String requestId() { return requestId; }
    Long serverTime() { return serverTime; }
    Long retryAfterSeconds() { return retryAfterSeconds; }

    private static String safeCode(String value) {
        if (value == null || !value.matches("[A-Z0-9_]{2,64}")) {
            return "HTTP_ERROR";
        }
        return value;
    }
}
