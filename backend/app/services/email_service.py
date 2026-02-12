import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

def send_faculty_credentials(to_email: str, name: str, password: str, faculty_id: str):
    """
    Send an email to the faculty member with their login credentials.
    """
    subject = "Welcome to Timetable Scheduler - Login Credentials"
    
    html_content = f"""
    <html>
        <body>
            <h2>Welcome, {name}!</h2>
            <p>You have been registered as a faculty member in the Timetable Scheduler system.</p>
            <p>Here are your login credentials:</p>
            <ul>
                <li><strong>Username/Email:</strong> {to_email}</li>
                <li><strong>Password:</strong> {password}</li>
                <li><strong>Faculty ID:</strong> {faculty_id}</li>
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
