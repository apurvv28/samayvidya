# Developer Setup Guide: SamayVidya

Welcome to the **SamayVidya (Academic Timetable Framework)**! This guide will walk you through the process of setting up the project locally on your machine for development, testing, and contribution.

---

## 1. Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Git**: For version control. ([Download Git](https://git-scm.com/))
- **Node.js**: Version 18.x or higher (for the Next.js frontend). ([Download Node.js](https://nodejs.org/))
- **Python**: Version 3.9 or higher (for the FastAPI backend). ([Download Python](https://www.python.org/))
- **Package Managers**: `npm` (comes with Node.js) and `pip` (comes with Python).

### Third-Party Accounts
You will also need accounts for the following services to get the necessary API credentials:
- **Supabase**: For the PostgreSQL database and authentications. ([Sign up](https://supabase.com/))
- **AWS Configuration**: For accessing AWS Bedrock models used by the AI orchestration engine. ([AWS Console](https://aws.amazon.com/))

---

## 2. Clone the Repository

Begin by cloning the repository to your local machine:

```bash
git clone https://github.com/apurvv28/samayvidya.git
cd samayvidya
```

*(Note: Replace the URL with the actual repository URL)*

---

## 3. Backend Setup (FastAPI)

The backend is built with Python and FastAPI, handling database interactions, API endpoints, and the multi-agent AI orchestration.

### A. Environment Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create a virtual environment:
   ```bash
   # On Windows
   python -m venv venv
   .\venv\Scripts\activate

   # On macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install the Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### B. Environment Variables configuration
Create a `.env` file in the `backend/` directory:
```bash
touch .env
```
Populate the `.env` file with the following variables:

```ini
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_or_anon_key

# AWS Bedrock Configuration (for LLM Orchestration)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_DEFAULT_REGION=us-east-1
BEDROCK_MODEL=amazon.bedrock-nova-pro-v1:0

# Application Settings
ALLOW_ANONYMOUS_API=False
```

---

## 4. Frontend Setup (Next.js)

The frontend is a modern web application built with React, Next.js, and TailwindCSS.

### A. Environment Setup
1. Open a new terminal window/tab and navigate to the `ui` directory from the project root:
   ```bash
   cd ui
   ```
2. Install the necessary Node.js dependencies:
   ```bash
   npm install
   ```

### B. Environment Variables Configuration
Create a `.env.local` file in the `ui/` directory:
```bash
touch .env.local
```
Add the following configuration:

```ini
# Backend API URL (Ensure the port matches where your FastAPI server runs)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Optional: Add Supabase publishable keys if directly connecting from the frontend
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 5. Acquiring Credentials

If you are setting this up from scratch, here is how you retrieve the mandated secret keys:

### Supabase Keys
1. Create a new project in the Supabase Dashboard.
2. Once provisioned, go to **Project Settings** (the gear icon) > **API**.
3. Copy the **Project URL** into `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy the `anon` `public` key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the `service_role` secret into `SUPABASE_KEY` (use service_role carefully; only in the backend).

### AWS Bedrock Keys
1. Log in to your AWS Management Console.
2. Go to **IAM** (Identity and Access Management) > **Users** > Create a User or select your developer user.
3. Under **Security credentials**, create a new **Access Key**.
4. Save the Access Key ID and Secret Access Key into your backend `.env`.
5. Go to the **Amazon Bedrock** console > **Model access** and ensure you have requested access to the required model (e.g., Nova Pro).

---

## 6. Running the System Locally

To see the application in action, you need to spin up both the backend and frontend servers simultaneously.

### Start the Backend Server
In your first terminal (where your virtual environment is activated and you are in the `backend/` folder):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
*The backend API should now be running at [http://localhost:8000](http://localhost:8000)*
*You can view the auto-generated Swagger documentation at [http://localhost:8000/docs](http://localhost:8000/docs)*

### Start the Frontend Server
In your second terminal (inside the `ui/` folder):

```bash
npm run dev
```
*The frontend application will compile and become accessible at [http://localhost:3000](http://localhost:3000)*

---

## 🎉 Success!
You are all set. Access the application on `http://localhost:3000` and start developing. For questions about architecture and structure, refer to the overarching `README.md` at the project root.