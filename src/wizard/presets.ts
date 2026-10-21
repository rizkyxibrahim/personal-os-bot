// Daftar awal pilihan akun. Silakan ubah sesuai kebutuhan (nama satu kata, maksimal 20 karakter).
export const BANKS = [
  "BCA",
  "Mandiri",
  "BNI",
  "BRI",
  "BSI",
  "CIMB",
  "Permata",
  "Danamon",
  "OCBC",
  "Maybank",
  "BTN",
  "BankDKI",
  "Jago",
  "SeaBank",
  "blu",
  "Jenius",
];

export const EWALLETS = [
  "DANA",
  "GoPay",
  "OVO",
  "ShopeePay",
  "LinkAja",
  "DOKU",
  "iSaku",
  "Sakuku",
  "AstraPay",
];

export const ACCOUNT_NAME_RE = /^[\p{L}\p{N}_-]{1,20}$/u;
