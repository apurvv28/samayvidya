import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

def send_user_credentials(to_email: str, name: str, password: str, role: str, identifier: str | None = None):
    """Send credentials email for non-student users."""
    role_text = (role or "USER").upper()
    identifier_line = ""
    if identifier:
        identifier_line = f"<li><strong>ID:</strong> {identifier}</li>"

    subject = f"Welcome to Timetable Scheduler - {role_text} Login Credentials"
    html_content = f"""
    <html>
        <body>
            <h2>Welcome, {name}!</h2>
            <p>You have been registered as a <strong>{role_text}</strong> in the Timetable Scheduler system.</p>
            <p>Here are your login credentials:</p>
            <ul>
                <li><strong>Username/Email:</strong> {to_email}</li>
                <li><strong>Password:</strong> {password}</li>
                {identifier_line}
            </ul>
            <p>Please login and change your password immediately.</p>
            <br>
            <p>Best regards,</p>
            <p>Timetable Scheduler Team</p>
        </body>
    </html>
    """

    message = MIMEMultipart()
    message["From"] = settings.smtp_username
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.smtp_server, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False


def send_faculty_credentials(to_email: str, name: str, password: str, faculty_id: str):
    """
    Send an email to the faculty member with their login credentials.
    """
    return send_user_credentials(
        to_email=to_email,
        name=name,
        password=password,
        role="FACULTY",
        identifier=faculty_id,
    )


def send_leave_approval_email(to_email: str, faculty_name: str, start_date: str, end_date: str, leave_type: str):
    """Send leave approval notification to faculty."""
    leave_type_text = leave_type.replace("_", " ").title()
    
    subject = "Leave Request Approved ✓"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #28a745;">Leave Request Approved</h2>
                <p>Dear {faculty_name},</p>
                <p>Your leave request has been <strong style="color: #28a745;">APPROVED</strong>.</p>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Leave Details:</h3>
                    <ul style="list-style: none; padding: 0;">
                        <li><strong>From:</strong> {start_date}</li>
                        <li><strong>To:</strong> {end_date}</li>
                        <li><strong>Type:</strong> {leave_type_text}</li>
                    </ul>
                </div>
                
                <p>You can now request slot adjustments for your classes during this period.</p>
                <p>Please log in to the system to manage your slot adjustments.</p>
                
                <br>
                <p>Best regards,</p>
                <p><strong>Academic Administration</strong></p>
            </div>
        </body>
    </html>
    """
    
    return _send_email(to_email, subject, html_content)


def send_leave_rejection_email(to_email: str, faculty_name: str, start_date: str, end_date: str, reason: str):
    """Send leave rejection notification to faculty."""
    subject = "Leave Request Not Approved"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #dc3545;">Leave Request Not Approved</h2>
                <p>Dear {faculty_name},</p>
                <p>We regret to inform you that your leave request has been <strong style="color: #dc3545;">NOT APPROVED</strong>.</p>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Leave Details:</h3>
                    <ul style="list-style: none; padding: 0;">
                        <li><strong>From:</strong> {start_date}</li>
                        <li><strong>To:</strong> {end_date}</li>
                    </ul>
                    <h3>Reason for Rejection:</h3>
                    <p style="background-color: #fff; padding: 10px; border-left: 3px solid #dc3545;">{reason}</p>
                </div>
                
                <p>If you have any questions or concerns, please contact the HOD.</p>
                
                <br>
                <p>Best regards,</p>
                <p><strong>Academic Administration</strong></p>
            </div>
        </body>
    </html>
    """
    
    return _send_email(to_email, subject, html_content)


def send_adjustment_request_email(to_email: str, requesting_faculty_name: str, start_date: str, end_date: str, affected_slots: int):
    """Send slot adjustment request to eligible faculty."""
    subject = f"Slot Adjustment Request from {requesting_faculty_name}"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #007bff;">Slot Adjustment Request</h2>
                <p>Dear Faculty Member,</p>
                <p><strong>{requesting_faculty_name}</strong> has requested slot adjustments due to approved leave.</p>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Leave Period:</h3>
                    <ul style="list-style: none; padding: 0;">
                        <li><strong>From:</strong> {start_date}</li>
                        <li><strong>To:</strong> {end_date}</li>
                        <li><strong>Affected Slots:</strong> {affected_slots}</li>
                    </ul>
                </div>
                
                <p>If you are available to cover any of these slots, please log in to the system to view details and accept the adjustment.</p>
                
                <div style="background-color: #fff3cd; padding: 10px; border-left: 3px solid #ffc107; margin: 20px 0;">
                    <strong>Note:</strong> The system will check your availability before allowing you to accept.
                </div>
                
                <br>
                <p>Best regards,</p>
                <p><strong>Timetable Scheduler System</strong></p>
            </div>
        </body>
    </html>
    """
    
    return _send_email(to_email, subject, html_content)


def send_slot_cancelled_notification(to_email: str, student_name: str, date: str, slot_time: str, subject_name: str):
    """Notify students when no faculty is available for a slot."""
    subject = f"Class Cancelled - {date}"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #dc3545;">Class Cancellation Notice</h2>
                <p>Dear {student_name},</p>
                <p>Please be informed that the following class has been <strong>CANCELLED</strong>:</p>
                
                <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 3px solid #dc3545;">
                    <ul style="list-style: none; padding: 0;">
                        <li><strong>Date:</strong> {date}</li>
                        <li><strong>Time:</strong> {slot_time}</li>
                        <li><strong>Subject:</strong> {subject_name}</li>
                        <li><strong>Reason:</strong> Faculty on leave, no substitute available</li>
                    </ul>
                </div>
                
                <p>You do not need to attend this class. Please check for any makeup classes that may be scheduled later.</p>
                
                <br>
                <p>Best regards,</p>
                <p><strong>Academic Administration</strong></p>
            </div>
        </body>
    </html>
    """
    
    return _send_email(to_email, subject, html_content)


def send_slot_covered_notification(to_email: str, student_name: str, original_faculty: str, covering_faculty: str, date: str):
    """Notify students when a slot has been covered by another faculty."""
    subject = f"Faculty Change Notification - {date}"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #28a745;">Faculty Change Notification</h2>
                <p>Dear {student_name},</p>
                <p>Please note the following temporary faculty change:</p>
                
                <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 3px solid #28a745;">
                    <ul style="list-style: none; padding: 0;">
                        <li><strong>Date:</strong> {date}</li>
                        <li><strong>Original Faculty:</strong> {original_faculty}</li>
                        <li><strong>Substitute Faculty:</strong> {covering_faculty}</li>
                    </ul>
                </div>
                
                <p>The class will proceed as scheduled with the substitute faculty.</p>
                <p>Please attend the class as usual.</p>
                
                <br>
                <p>Best regards,</p>
                <p><strong>Academic Administration</strong></p>
            </div>
        </body>
    </html>
    """
    
    return _send_email(to_email, subject, html_content)


def send_revised_timetable_update_email(
    to_email: str,
    student_name: str,
    leave_date: str,
    update_lines: list[str],
) -> bool:
    """Send revised day timetable updates to student."""
    rows_html = "".join(f"<li>{line}</li>" for line in (update_lines or []))
    if not rows_html:
        rows_html = "<li>No revised slots for your division.</li>"
    subject = f"Revised Day Timetable - {leave_date}"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #0d6efd;">Revised Day Timetable</h2>
                <p>Dear {student_name},</p>
                <p>Please review the updated timetable for <strong>{leave_date}</strong>.</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <ul style="padding-left: 18px; margin: 0;">
                        {rows_html}
                    </ul>
                </div>
                <p>Slots without accepted replacement are marked as <strong>FREE SLOT</strong>.</p>
                <br>
                <p>Best regards,</p>
                <p><strong>Academic Administration</strong></p>
            </div>
        </body>
    </html>
    """
    return _send_email(to_email, subject, html_content)


def _send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Internal helper to send email."""
    message = MIMEMultipart()
    message["From"] = settings.smtp_username
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.smtp_server, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return True
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
        return False

