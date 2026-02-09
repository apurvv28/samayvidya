# Deployment Guide

Complete guide for deploying the Timetable Scheduler API to production.

## Prerequisites

- Docker & Docker Compose (recommended)
- Python 3.10+ (if not using Docker)
- Supabase account (database already set up)
- Cloud provider account (AWS, GCP, Azure, etc.)

## Local Development

### Quick Start

```bash
# 1. Install dependencies
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# 3. Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Using Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f api

# Stop
docker-compose down
```

## Production Deployment

### Option 1: Cloud Run (Google Cloud)

```bash
# 1. Build Docker image
docker build -t timetable-api:latest .

# 2. Push to Google Container Registry
docker tag timetable-api:latest gcr.io/YOUR_PROJECT_ID/timetable-api:latest
docker push gcr.io/YOUR_PROJECT_ID/timetable-api:latest

# 3. Deploy to Cloud Run
gcloud run deploy timetable-api \
  --image gcr.io/YOUR_PROJECT_ID/timetable-api:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars="SUPABASE_URL=....,SUPABASE_ANON_KEY=....,SUPABASE_SERVICE_ROLE_KEY=....,ENVIRONMENT=production" \
  --allow-unauthenticated
```

### Option 2: AWS Elastic Container Service (ECS)

```bash
# 1. Create ECR repository
aws ecr create-repository --repository-name timetable-api

# 2. Build and push
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker build -t timetable-api:latest .
docker tag timetable-api:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/timetable-api:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/timetable-api:latest

# 3. Create ECS service (use AWS Console or CLI)
```

### Option 3: Heroku

```bash
# 1. Create Procfile
echo "web: uvicorn app.main:app --host 0.0.0.0 --port \$PORT" > Procfile

# 2. Deploy
heroku create timetable-api
heroku config:set SUPABASE_URL=...
heroku config:set SUPABASE_ANON_KEY=...
heroku config:set SUPABASE_SERVICE_ROLE_KEY=...
git push heroku main
```

### Option 4: Linux Server (Manual)

```bash
# 1. SSH into server
ssh ubuntu@your-server-ip

# 2. Install Python and system dependencies
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev nginx supervisor

# 3. Clone repository
git clone YOUR_REPO_URL
cd backend

# 4. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 5. Create systemd service
sudo cat > /etc/systemd/system/timetable-api.service << EOF
[Unit]
Description=Timetable Scheduler API
After=network.target

[Service]
Type=notify
User=ubuntu
WorkingDirectory=/home/ubuntu/backend
EnvironmentFile=/home/ubuntu/backend/.env
ExecStart=/home/ubuntu/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable timetable-api
sudo systemctl start timetable-api

# 6. Configure Nginx as reverse proxy
sudo cat > /etc/nginx/sites-available/timetable-api << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket support (for future use)
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/timetable-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 7. Set up HTTPS with Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Environment Configuration

### Production .env

```env
# Supabase (keep SERVICE_ROLE_KEY secure!)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiI... # NEVER share this!

# API Configuration
DEBUG=False
ENVIRONMENT=production

# CORS (adjust for your frontend domain)
FRONTEND_URL=https://timetable.example.com
```

## Security Checklist

- [ ] `.env` file not committed to git
- [ ] `SERVICE_ROLE_KEY` never logged or exposed
- [ ] HTTPS enabled on production domain
- [ ] CORS configured for specific frontend origin (not `*`)
- [ ] API rate limiting enabled (implement if high traffic)
- [ ] Request logging configured
- [ ] Error messages don't leak sensitive data
- [ ] Database backups automated (Supabase handles this)
- [ ] Monitoring & alerts set up
- [ ] Regular security updates for dependencies

## Monitoring

### Health Check

```bash
curl https://your-api.com/health
```

### View Logs

**Cloud Run:**
```bash
gcloud run logs read timetable-api --limit 100
```

**Linux Server:**
```bash
sudo journalctl -u timetable-api -f
```

### Set Up Alerting

1. Monitor API health endpoint regularly
2. Track error rate from Supabase logs
3. Monitor server disk/memory usage
4. Set up alerts for deployment failures

## Scaling

### Horizontal Scaling (Multiple Instances)

Most cloud platforms auto-scale the API:

**Cloud Run:**
- Auto-scales based on traffic
- No configuration needed

**ECS/Kubernetes:**
- Configure target group
- Set up auto-scaling policy

### Database Scaling

Supabase handles scaling automatically. For high traffic:
- Enable Connection Pooling (Supabase PgBouncer)
- Consider read replicas for complex queries

## Rollback

If deployment fails:

**Cloud Run:**
```bash
gcloud run deploy timetable-api --revision=PREVIOUS_REVISION_ID
```

**Git:**
```bash
git revert <commit-hash>
git push
```

## Cost Optimization

- Use Cloud Run or Fargate (pay per request)
- Don't over-provision CPU/memory
- Supabase free tier: 500MB database, 2GB bandwidth
- Monitor costs in cloud provider console

## Next Steps

1. Set up CI/CD pipeline (GitHub Actions, GitLab CI)
2. Add integration tests
3. Configure automated deployments
4. Set up monitoring dashboard
5. Document runbooks for common issues
