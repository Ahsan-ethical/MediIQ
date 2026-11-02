"""
AHA 2017 blood pressure and heart rate classification rules.

Reference:
    Whelton PK, et al. "2017 ACC/AHA … Hypertension Guidelines."
    Hypertension. 2018;71(6):e13-e115.
"""


def classify_bp(sbp: float, dbp: float) -> str:
    """
    Classify blood pressure per AHA 2017 guidelines.

    Args:
        sbp: Systolic blood pressure in mmHg.
        dbp: Diastolic blood pressure in mmHg.

    Returns:
        One of: "Hypertensive Crisis", "Stage 2 Hypertension",
                "Stage 1 Hypertension", "Elevated", "Normal".
    """
    if sbp > 180 or dbp > 120:
        return "Hypertensive Crisis"
    if sbp >= 140 or dbp >= 90:
        return "Stage 2 Hypertension"
    if sbp >= 130 or dbp >= 80:
        return "Stage 1 Hypertension"
    if sbp >= 120 and dbp < 80:
        return "Elevated"
    return "Normal"


def classify_hr(hr: float) -> str:
    """
    Classify heart rate.

    Args:
        hr: Heart rate in bpm.

    Returns:
        One of: "Bradycardia", "Normal", "Tachycardia".
    """
    if hr < 60:
        return "Bradycardia"
    if hr > 100:
        return "Tachycardia"
    return "Normal"
