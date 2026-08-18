// Import every model for its side effect: each one calls register() at import
// time, which is what puts its schema in the registry.
//
// indexes.js declares indexes by model NAME rather than by importing each
// model, so it needs the schemas to have registered themselves first. Without
// this, whether an index got declared would depend on which models some other
// module happened to have imported already.
import './Ambulance.js';
import './AmbulanceTrip.js';
import './Appointment.js';
import './Attendance.js';
import './AuditLog.js';
import './Bed.js';
import './BloodDonor.js';
import './BloodUnit.js';
import './ClaimDocument.js';
import './Counter.js';
import './Department.js';
import './Doctor.js';
import './Employee.js';
import './ErrorLog.js';
import './InsuranceClaim.js';
import './InventoryItem.js';
import './InventoryItemBatch.js';
import './Invoice.js';
import './IPDAdmission.js';
import './LabOrder.js';
import './LabTest.js';
import './Leave.js';
import './Medicine.js';
import './MedicineBatch.js';
import './MedicineDispense.js';
import './Notification.js';
import './OPDVisit.js';
import './OperationTheatre.js';
import './Patient.js';
import './PatientDocument.js';
import './Payment.js';
import './Payslip.js';
import './PurchaseOrder.js';
import './RadiologyOrder.js';
import './RadiologyTest.js';
import './Role.js';
import './Room.js';
import './Session.js';
import './Setting.js';
import './StockTransaction.js';
import './Surgery.js';
import './TariffPlan.js';
import './EmergencyVisit.js';
import './ClinicalRecord.js';
import './OpdToken.js';
import './Deposit.js';
import './User.js';
import './Vendor.js';
import './Ward.js';
