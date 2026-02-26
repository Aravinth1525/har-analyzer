import pandas as pd
import json


def extract_endpoint(url):
    try:
        parts = url.split("/")
        return "/" + "/".join(parts[3:6])
    except:
        return url


def detect_failure_reason(status, time_ms, size):

    if status == 504:
        return "Gateway Timeout"

    if status >= 500:
        return "Server Error"

    if status >= 400:
        return "Client Error"

    if time_ms > 30000:
        return "Very Slow Response"

    if size == -1 and status >= 400:
        return "Connection Issue"

    return "OK"


def find_error(obj):

    if isinstance(obj, dict):

        for key in ["error_message", "errMsg", "message", "error"]:
            if key in obj and obj[key]:
                return str(obj[key])

        for v in obj.values():
            res = find_error(v)
            if res:
                return res

    elif isinstance(obj, list):
        for item in obj:
            res = find_error(item)
            if res:
                return res

    return ""


def extract_error_message(response_text):

    if not response_text:
        return ""

    try:
        data = json.loads(response_text)
        return find_error(data)
    except:
        return ""


def analyze_har(har_data):

    entries = har_data["log"]["entries"]

    rows = []

    for e in entries:

        url = e["request"]["url"]
        method = e["request"]["method"]
        status = e["response"]["status"]
        time = e["time"]

        size = e["response"].get("bodySize", -1)
        response_text = e["response"].get("content", {}).get("text", "")

        reason = detect_failure_reason(status, time, size)
        error_msg = extract_error_message(response_text)

        rows.append({
            "url": url,
            "endpoint": extract_endpoint(url),
            "method": method,
            "status": status,
            "time": time,
            "size": size,
            "response": response_text,
            "reason": reason,
            "error_message": error_msg
        })

    df = pd.DataFrame(rows)

    summary = {
        "total": len(df),
        "avg": float(df["time"].mean()),
        "max": float(df["time"].max()),
        "failed": int((df["status"] >= 400).sum()),
    }

    return {
        "summary": summary,
        "apis": df.to_dict(orient="records")
    }