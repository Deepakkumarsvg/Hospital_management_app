# Database Design

**Database:** `hospital_management` (MongoDB)

Relationships use ObjectId references (not deep embedding) so history and
transactional data stay in their own collections.

## Implemented Collections (Phase 1)

### `users`
| Field        | Type     | Notes                                   |
| ------------ | -------- | --------------------------------------- |
| name         | String   | required                                |
| email        | String   | required, unique, lowercase             |
| phone        | String   |                                         |
| passwordHash | String   | bcrypt, `select: false`                 |
| role         | String   | enum of role names                      |
| department   | ObjectId | → `departments`, nullable               |
| status       | String   | ACTIVE / INACTIVE / SUSPENDED           |
| lastLoginAt  | Date     |                                         |
| timestamps   | Date     | createdAt / updatedAt                   |

### `roles`
| Field       | Type     | Notes                        |
| ----------- | -------- | ---------------------------- |
| name        | String   | required, unique, enum       |
| description | String   |                              |
| permissions | [String] | reserved for fine-grained ACL |

### `departments`
| Field       | Type   | Notes                   |
| ----------- | ------ | ----------------------- |
| name        | String | required, unique        |
| code        | String | required, unique, upper |
| description | String |                         |
| status      | String | ACTIVE / INACTIVE       |

### `patients`
| Field            | Type     | Notes                                        |
| ---------------- | -------- | -------------------------------------------- |
| uhid             | String   | unique, auto `HMS-YYYY-000001`               |
| firstName        | String   | required                                     |
| lastName         | String   |                                              |
| gender           | String   | MALE / FEMALE / OTHER                         |
| dateOfBirth      | Date     | required (`age` is a computed virtual)       |
| phone            | String   | required, indexed                            |
| email            | String   | lowercase                                    |
| bloodGroup       | String   | A± / B± / AB± / O± / UNKNOWN                  |
| address          | Object   | line, city, state, pincode                   |
| emergencyContact | Object   | name, relation, phone                        |
| allergies        | String   |                                              |
| medicalHistory   | String   |                                              |
| insurance        | Object   | provider, policyNumber, validTill            |
| status           | String   | ACTIVE / INACTIVE                            |
| createdBy        | ObjectId | → `users`                                    |
| timestamps       | Date     | createdAt / updatedAt                        |

### `doctors`
| Field           | Type     | Notes                               |
| --------------- | -------- | ----------------------------------- |
| firstName       | String   | required                            |
| registrationNo  | String   | unique                              |
| specialization  | String   | required                            |
| department      | ObjectId | → `departments`                     |
| qualification   | String   |                                     |
| experienceYears | Number   |                                     |
| phone / email   | String   |                                     |
| consultationFee | Number   |                                     |
| availability    | [Object] | `{ day, from, to }` per weekday     |
| status          | String   | ACTIVE / INACTIVE                   |
| user            | ObjectId | → `users` (optional login link)     |

### `appointments`
| Field         | Type     | Notes                                        |
| ------------- | -------- | -------------------------------------------- |
| appointmentNo | String   | unique, auto `APT-YYYY-000001`               |
| patient       | ObjectId | → `patients`                                 |
| doctor        | ObjectId | → `doctors`                                  |
| department    | ObjectId | → `departments`                              |
| date / time   | Date/Str | day + `HH:mm` slot                           |
| type          | String   | NEW / FOLLOW_UP / EMERGENCY                   |
| status        | String   | BOOKED / CHECKED_IN / IN_PROGRESS / COMPLETED / CANCELLED / NO_SHOW |
| reason/notes  | String   |                                              |
| createdBy     | ObjectId | → `users`                                    |

Status transitions are enforced server-side; a doctor cannot be double-booked
for the same date+time while an appointment is active.

### `patientdocuments`
| Field        | Type     | Notes                                        |
| ------------ | -------- | -------------------------------------------- |
| patient      | ObjectId | → `patients`                                 |
| category     | String   | ID_PROOF / LAB_REPORT / PRESCRIPTION / …     |
| originalName | String   | uploaded filename                            |
| storageKey   | String   | relative path in the storage layer           |
| mimeType     | String   |                                              |
| size         | Number   | bytes                                        |
| uploadedBy   | ObjectId | → `users`                                    |

Binaries live on the storage layer (`uploads/patients/<id>/…`), **never inside
Mongo**. The `doctors.user` field optionally links a doctor to a login account.

### `opdvisits`
`visitNo` (auto `OPD-YYYY-000001`), patient, doctor, department, appointment?,
`vitals{bp,pulse,temperature,spo2,weight,height,respiratoryRate}`, symptoms,
diagnosis, clinicalNotes, `prescription[]` (medicine, dosage, frequency,
duration, route, instructions, quantity), followUpDate, status (OPEN/COMPLETED/CANCELLED).

### `wards` / `rooms` / `beds`
- **wards:** name, code, type (GENERAL/ICU/…), department?, floor, status
- **rooms:** ward→, roomNo (unique per ward), status
- **beds:** bedNo (unique per room), room→, ward→ (denormalised), status
  (AVAILABLE/OCCUPIED/RESERVED/MAINTENANCE), dailyCharge, currentAdmission→

### `ipdadmissions`
`admissionNo` (auto `IPD-YYYY-000001`), patient, admittingDoctor, department,
ward/room/bed→, admissionDate, dischargeDate, reason, diagnosis,
dischargeSummary, status (ADMITTED/DISCHARGED/CANCELLED), `nursingNotes[]`
(note, by→, at). Virtual `lengthOfStayDays`. Admitting/transferring/discharging
keeps the referenced bed's status in sync.

### `counters`
Atomic sequence store (`_id` = key like `uhid-2026` / `appointment-2026` /
`opd-2026` / `ipd-2026`, `seq` = number) for gap-free, year-scoped IDs.

## Planned Collections (later phases)
`patients`, `doctors`, `appointments`, `opd_visits`, `ipd_admissions`,
`wards`, `rooms`, `beds`, `prescriptions`, `medicines`, `medicine_batches`,
`lab_tests`, `lab_orders`, `lab_results`, `radiology_*`, `invoices`,
`payments`, `insurance*`, `inventory_items`, `vendors`, `purchase_orders`,
`stock_transactions`, `surgeries`, `ot_schedules`, `blood_*`, `employees`,
`notifications`, `audit_logs`.

## Seed Data
`npm run seed` (in `backend/`) creates:
- 12 roles
- 6 departments (Cardiology, General Medicine, Orthopedics, Radiology, Pathology, Emergency)
- 1 SUPER_ADMIN user

The seed is **idempotent** — safe to run repeatedly; it never overwrites an
existing admin password.
