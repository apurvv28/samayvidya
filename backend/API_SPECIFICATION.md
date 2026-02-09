# API Specification

Complete reference for all API endpoints.

## Base URL

```
http://localhost:8000
```

## Authentication

All endpoints (except `/health`) require:

```
Authorization: Bearer <JWT_TOKEN>
```

## Response Format

### Success Response
```json
{
  "data": [] | {} | null,
  "message": "Success message"
}
```

### Error Response
```json
{
  "detail": "Error description"
}
```

## HTTP Status Codes

- `200` - OK
- `201` - Created
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Endpoints

### Health Check

#### GET `/health`
Check API health.

**No authentication required**

**Response:**
```json
{
  "status": "healthy",
  "environment": "development",
  "service": "Timetable Scheduler API"
}
```

---

## Authentication Routes

### GET `/auth/me`
Get current authenticated user's profile.

**Required:** JWT Token

**Response:**
```json
{
  "data": {
    "user_id": "uuid",
    "role": "FACULTY",
    "faculty_id": "uuid",
    "division_id": "uuid"
  },
  "message": "User profile retrieved successfully"
}
```

### POST `/auth/logout`
Logout the current user.

**Required:** JWT Token

**Response:**
```json
{
  "data": null,
  "message": "Logout successful"
}
```

---

## Departments Routes

### GET `/departments`
List all departments (RLS enforced).

**Required:** JWT Token

**Query Parameters:** None

**Response:**
```json
{
  "data": [
    {
      "department_id": "uuid",
      "department_name": "Computer Science",
      "academic_year": "2024-25",
      "semester": 1,
      "start_date": "2024-08-01",
      "end_date": "2024-12-15"
    }
  ],
  "message": "Departments retrieved successfully"
}
```

### GET `/departments/{department_id}`
Get a specific department.

**Required:** JWT Token

**Path Parameters:**
- `department_id` (uuid) - Department ID

**Response:** Single department object

### POST `/departments`
Create a new department.

**Required:** JWT Token

**Request Body:**
```json
{
  "department_name": "Computer Science",
  "academic_year": "2024-25",
  "semester": 1,
  "start_date": "2024-08-01",
  "end_date": "2024-12-15"
}
```

**Response:** Created department object

### PUT `/departments/{department_id}`
Update a department.

**Required:** JWT Token

**Path Parameters:**
- `department_id` (uuid)

**Request Body:** (all fields optional)
```json
{
  "department_name": "CS",
  "academic_year": "2025-26",
  "semester": 2
}
```

**Response:** Updated department object

### DELETE `/departments/{department_id}`
Delete a department.

**Required:** JWT Token

**Response:** Deleted department object

---

## Divisions Routes

### GET `/divisions`
List all divisions.

**Response:** Array of division objects
```json
{
  "division_id": "uuid",
  "division_name": "CSAI-A",
  "year": "Second Year",
  "department_id": "uuid",
  "student_count": 60,
  "min_working_days": 5,
  "max_working_days": 6,
  "earliest_start_time": "09:00",
  "latest_end_time": "17:00"
}
```

### POST `/divisions`
Create division.

**Request Body:**
```json
{
  "division_name": "CSAI-A",
  "year": "Second Year",
  "department_id": "uuid",
  "student_count": 60,
  "min_working_days": 5,
  "max_working_days": 6,
  "earliest_start_time": "09:00",
  "latest_end_time": "17:00"
}
```

### PUT `/divisions/{division_id}`
Update division.

### DELETE `/divisions/{division_id}`
Delete division.

---

## Subjects Routes

### GET `/subjects`
List all subjects.

**Response:**
```json
{
  "subject_id": "CS201",
  "subject_name": "Data Structures",
  "subject_type": "THEORY",
  "credits": 3,
  "hours_per_week": 4,
  "requires_continuity": false,
  "department_id": "uuid"
}
```

### POST `/subjects`
Create subject.

**Request Body:**
```json
{
  "subject_id": "CS201",
  "subject_name": "Data Structures",
  "subject_type": "THEORY",
  "credits": 3,
  "hours_per_week": 4,
  "requires_continuity": false,
  "department_id": "uuid"
}
```

**Subject Types:** `THEORY`, `LAB`, `TUTORIAL`

### PUT `/subjects/{subject_id}`
Update subject.

### DELETE `/subjects/{subject_id}`
Delete subject.

---

## Faculty Routes

### GET `/faculty`
List all faculty members.

**Response:**
```json
{
  "faculty_id": "uuid",
  "faculty_code": "AS",
  "faculty_name": "Dr. Alice Smith",
  "role": "FACULTY",
  "priority_level": 1,
  "preferred_start_time": "09:00",
  "preferred_end_time": "17:00",
  "min_working_days": 5,
  "max_working_days": 6,
  "max_load_per_week": 20,
  "department_id": "uuid",
  "is_active": true
}
```

### POST `/faculty`
Create faculty member.

**Request Body:**
```json
{
  "faculty_code": "AS",
  "faculty_name": "Dr. Alice Smith",
  "role": "FACULTY",
  "priority_level": 1,
  "preferred_start_time": "09:00",
  "preferred_end_time": "17:00",
  "min_working_days": 5,
  "max_working_days": 6,
  "max_load_per_week": 20,
  "department_id": "uuid",
  "is_active": true
}
```

**Roles:** `FACULTY`, `LAB_INCHARGE`, `COORDINATOR`, `HOD`

### PUT `/faculty/{faculty_id}`
Update faculty.

### DELETE `/faculty/{faculty_id}`
Delete faculty.

---

## Rooms Routes

### GET `/rooms`
List all rooms.

**Response:**
```json
{
  "room_id": "uuid",
  "room_number": "2308",
  "room_type": "CLASSROOM",
  "capacity": 60,
  "department_id": "uuid",
  "is_active": true
}
```

### POST `/rooms`
Create room.

**Request Body:**
```json
{
  "room_number": "2308",
  "room_type": "CLASSROOM",
  "capacity": 60,
  "department_id": "uuid",
  "is_active": true
}
```

**Room Types:** `CLASSROOM`, `LAB`

### PUT `/rooms/{room_id}`
Update room.

### DELETE `/rooms/{room_id}`
Delete room.

---

## Batches Routes

### GET `/batches`
List all batches.

**Response:**
```json
{
  "batch_id": "uuid",
  "division_id": "uuid",
  "batch_code": "B1",
  "is_active": true
}
```

### POST `/batches`
Create batch.

### PUT `/batches/{batch_id}`
Update batch.

### DELETE `/batches/{batch_id}`
Delete batch.

---

## Days Routes

### GET `/days`
List all working days.

**Response:**
```json
{
  "day_id": 1,
  "day_name": "Monday",
  "is_working_day": true
}
```

### POST `/days`
Create day.

### PUT `/days/{day_id}`
Update day.

### DELETE `/days/{day_id}`
Delete day.

---

## Time Slots Routes

### GET `/time-slots`
List all time slots.

**Response:**
```json
{
  "slot_id": "uuid",
  "start_time": "09:00",
  "end_time": "10:00",
  "slot_order": 1,
  "is_break": false
}
```

### POST `/time-slots`
Create time slot.

### PUT `/time-slots/{slot_id}`
Update time slot.

### DELETE `/time-slots/{slot_id}`
Delete time slot.

---

## Timetable Versions Routes

### GET `/timetable-versions`
List all timetable versions.

**Response:**
```json
{
  "version_id": "uuid",
  "created_at": "2024-08-01T10:30:00",
  "created_by": "SYSTEM",
  "reason": "Initial creation",
  "is_active": true
}
```

### POST `/timetable-versions`
Create timetable version.

### PUT `/timetable-versions/{version_id}`
Update timetable version.

### DELETE `/timetable-versions/{version_id}`
Delete timetable version.

---

## Timetable Entries Routes

### GET `/timetable-entries`
List all timetable entries.

**Response:**
```json
{
  "entry_id": "uuid",
  "version_id": "uuid",
  "division_id": "uuid",
  "subject_id": "CS201",
  "faculty_id": "uuid",
  "room_id": "uuid",
  "day_id": 1,
  "slot_id": "uuid",
  "batch_id": "uuid",
  "session_type": "THEORY"
}
```

### POST `/timetable-entries`
Create timetable entry.

### PUT `/timetable-entries/{entry_id}`
Update timetable entry.

### DELETE `/timetable-entries/{entry_id}`
Delete timetable entry.

---

## Faculty Leaves Routes

### GET `/faculty-leaves`
List all faculty leaves.

**Response:**
```json
{
  "leave_id": "uuid",
  "faculty_id": "uuid",
  "start_date": "2024-10-01",
  "end_date": "2024-10-07",
  "reason": "Sick leave",
  "status": "PENDING"
}
```

### POST `/faculty-leaves`
Create faculty leave request.

**Request Body:**
```json
{
  "faculty_id": "uuid",
  "start_date": "2024-10-01",
  "end_date": "2024-10-07",
  "reason": "Sick leave"
}
```

### PUT `/faculty-leaves/{leave_id}`
Update faculty leave (approve/reject).

**Request Body:**
```json
{
  "status": "APPROVED"
}
```

**Statuses:** `PENDING`, `APPROVED`, `REJECTED`

### DELETE `/faculty-leaves/{leave_id}`
Delete faculty leave.

---

## Campus Events Routes

### GET `/campus-events`
List all campus events.

**Response:**
```json
{
  "event_id": "uuid",
  "event_name": "Hackathon 2024",
  "start_date": "2024-11-15",
  "end_date": "2024-11-16",
  "event_type": "ACADEMIC",
  "affected_rooms": ["uuid1", "uuid2"],
  "affected_divisions": ["uuid1", "uuid2"]
}
```

### POST `/campus-events`
Create campus event.

**Request Body:**
```json
{
  "event_name": "Hackathon 2024",
  "start_date": "2024-11-15",
  "end_date": "2024-11-16",
  "event_type": "ACADEMIC",
  "affected_rooms": ["uuid1"],
  "affected_divisions": ["uuid1"]
}
```

**Event Types:** `ACADEMIC`, `NON_ACADEMIC`

### PUT `/campus-events/{event_id}`
Update campus event.

### DELETE `/campus-events/{event_id}`
Delete campus event.

---

## Example Requests

### List Departments with cURL
```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8000/departments
```

### Create Department
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "department_name": "Computer Science",
    "academic_year": "2024-25",
    "semester": 1,
    "start_date": "2024-08-01",
    "end_date": "2024-12-15"
  }' \
  http://localhost:8000/departments
```

### Update Department
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "department_name": "Computer Science & AI"
  }' \
  http://localhost:8000/departments/{department_id}
```

### Delete Department
```bash
curl -X DELETE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8000/departments/{department_id}
```

---

## Error Examples

### Missing Authorization Header
```json
{
  "detail": "Not authenticated"
}
```
Status: 403

### Invalid Token
```json
{
  "detail": "Token decode error: ..."
}
```
Status: 401

### Resource Not Found
```json
{
  "detail": "Department not found: ..."
}
```
Status: 404

### Bad Request
```json
{
  "detail": "Failed to create department: ..."
}
```
Status: 400

---

## Rate Limiting

Not currently implemented. Can be added per environment requirements.

## CORS

Configured for:
- `http://localhost:3000`
- `http://localhost:5173`
- `http://localhost:8080`

Modify in `app/main.py` for production.

## OpenAPI Documentation

Interactive API docs available at:
- Swagger UI: `GET /docs`
- ReDoc: `GET /redoc`
- OpenAPI JSON: `GET /openapi.json`
