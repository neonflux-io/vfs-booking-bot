/**
 * VFS Global CSS selectors.
 *
 * IMPORTANT: These are overridable at runtime via the Settings table key "vfs.selectors".
 * On engine startup, DB overrides are merged with these defaults.
 * If VFS changes their DOM, update via the Settings UI — no redeploy required.
 */

export interface VfsSelectors {
  // Login page
  loginEmail: string;
  loginPassword: string;
  loginSubmit: string;

  // Country / visa selection
  countryOfResidenceDropdown: string;
  destinationCountryDropdown: string;
  visaCategoryDropdown: string;
  continueButton: string;

  // Appointment availability
  appointmentCalendar: string;
  availableSlot: string;
  slotDateCell: string;
  slotTimeButton: string;
  noSlotsMessage: string;

  // Applicant form
  firstNameInput: string;
  lastNameInput: string;
  passportNumberInput: string;
  dobInput: string;
  passportExpiryInput: string;
  nationalityDropdown: string;
  emailInput: string;
  phoneInput: string;

  // Booking confirmation
  submitButton: string;
  confirmButton: string;
  confirmationNumber: string;

  // Navigation
  bookAppointmentLink: string;
  logoutLink: string;
}

export const DEFAULT_SELECTORS: VfsSelectors = {
  // Login
  loginEmail: 'input[type="email"], input[name="email"], #email',
  loginPassword: 'input[type="password"], input[name="password"], #password',
  loginSubmit: 'button[type="submit"], input[type="submit"], .login-btn',

  // Country / visa selection
  countryOfResidenceDropdown: 'select[name*="country"], #countryOfResidence',
  destinationCountryDropdown: 'select[name*="mission"], #destinationCountry',
  visaCategoryDropdown: 'select[name*="visa"], #visaCategory',
  continueButton: 'button:has-text("Continue"), a:has-text("Continue"), .btn-continue',

  // Appointment calendar
  appointmentCalendar: '.calendar, .date-picker, [class*="calendar"]',
  availableSlot: '.available, .open-slot, td.available, td:not(.disabled):not(.booked)',
  slotDateCell: 'td[data-date]:not(.disabled)',
  slotTimeButton: '.time-slot button, .time-slot a, [class*="timeslot"]:not(.disabled)',
  noSlotsMessage: '.no-slots, .no-appointment, [class*="no-slot"]',

  // Applicant form
  firstNameInput: 'input[name*="first"], input[name*="given"], #firstName',
  lastNameInput: 'input[name*="last"], input[name*="surname"], #lastName',
  passportNumberInput: 'input[name*="passport"], input[name*="document"], #passportNumber',
  dobInput: 'input[name*="dob"], input[name*="birth"], #dateOfBirth',
  passportExpiryInput: 'input[name*="expiry"], input[name*="expire"], #passportExpiry',
  nationalityDropdown: 'select[name*="nationality"], #nationality',
  emailInput: 'input[type="email"]:not([name*="login"]), input[name*="email"]',
  phoneInput: 'input[type="tel"], input[name*="phone"], input[name*="mobile"]',

  // Booking
  submitButton: 'button:has-text("Submit"), button:has-text("Book"), .btn-submit',
  confirmButton: 'button:has-text("Confirm"), .btn-confirm',
  confirmationNumber: '.confirmation-number, .booking-ref, [class*="confirm"] strong',

  // Navigation
  bookAppointmentLink: 'a:has-text("Book Appointment"), a:has-text("New Booking")',
  logoutLink: 'a:has-text("Logout"), a:has-text("Sign Out"), .logout',
};

// Runtime selectors (merged with DB overrides on engine startup)
let activeSelectors: VfsSelectors = { ...DEFAULT_SELECTORS };

export function getSelectors(): VfsSelectors {
  return activeSelectors;
}

export function applyOverrides(overrides: Partial<VfsSelectors>): void {
  activeSelectors = { ...DEFAULT_SELECTORS, ...overrides };
}
