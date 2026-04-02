/**
 * VFS Global Reference Data
 *
 * Comprehensive mapping of source countries, destination countries,
 * visa application centres (VACs / cities), and visa type categories.
 *
 * ISO 3166-1 alpha-3 codes are used for all country identifiers, matching
 * VFS Global's URL structure: visa.vfsglobal.com/{source}/{dest}/{lang}/
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VfsCountry {
  code: string;   // ISO 3166-1 alpha-3
  label: string;  // Display name
}

export interface VfsCentre {
  id: string;      // Unique key (e.g., "london", "new_delhi")
  label: string;   // Display name
  address?: string; // Optional physical address
}

export interface VfsVisaType {
  code: string;    // Internal code sent to VFS API
  label: string;   // Display name
  category: 'short-stay' | 'long-stay' | 'national' | 'other';
}

// ─── Source Countries (Applying From) ────────────────────────────────────────

export const SOURCE_COUNTRIES: VfsCountry[] = [
  // Europe
  { code: 'gbr', label: 'United Kingdom' },
  { code: 'deu', label: 'Germany' },
  { code: 'fra', label: 'France' },
  { code: 'ita', label: 'Italy' },
  { code: 'esp', label: 'Spain' },
  { code: 'nld', label: 'Netherlands' },
  { code: 'bel', label: 'Belgium' },
  { code: 'che', label: 'Switzerland' },
  { code: 'aut', label: 'Austria' },
  { code: 'pol', label: 'Poland' },
  { code: 'cze', label: 'Czech Republic' },
  { code: 'swe', label: 'Sweden' },
  { code: 'nor', label: 'Norway' },
  { code: 'dnk', label: 'Denmark' },
  { code: 'fin', label: 'Finland' },
  { code: 'irl', label: 'Ireland' },
  { code: 'grc', label: 'Greece' },
  { code: 'tur', label: 'Turkey' },
  { code: 'rou', label: 'Romania' },
  { code: 'hun', label: 'Hungary' },
  { code: 'hrv', label: 'Croatia' },
  { code: 'prt', label: 'Portugal' },
  { code: 'ukr', label: 'Ukraine' },
  { code: 'srb', label: 'Serbia' },
  { code: 'rus', label: 'Russia' },

  // Middle East
  { code: 'are', label: 'United Arab Emirates' },
  { code: 'sau', label: 'Saudi Arabia' },
  { code: 'qat', label: 'Qatar' },
  { code: 'kwt', label: 'Kuwait' },
  { code: 'bhr', label: 'Bahrain' },
  { code: 'omn', label: 'Oman' },
  { code: 'jor', label: 'Jordan' },
  { code: 'lbn', label: 'Lebanon' },
  { code: 'irq', label: 'Iraq' },

  // Africa
  { code: 'ago', label: 'Angola' },
  { code: 'zaf', label: 'South Africa' },
  { code: 'nga', label: 'Nigeria' },
  { code: 'ken', label: 'Kenya' },
  { code: 'egy', label: 'Egypt' },
  { code: 'gha', label: 'Ghana' },
  { code: 'mar', label: 'Morocco' },
  { code: 'tun', label: 'Tunisia' },
  { code: 'eth', label: 'Ethiopia' },
  { code: 'tza', label: 'Tanzania' },
  { code: 'dza', label: 'Algeria' },
  { code: 'cmr', label: 'Cameroon' },
  { code: 'sen', label: 'Senegal' },

  // South Asia
  { code: 'ind', label: 'India' },
  { code: 'pak', label: 'Pakistan' },
  { code: 'bgd', label: 'Bangladesh' },
  { code: 'lka', label: 'Sri Lanka' },
  { code: 'npl', label: 'Nepal' },

  // Southeast & East Asia
  { code: 'phl', label: 'Philippines' },
  { code: 'tha', label: 'Thailand' },
  { code: 'idn', label: 'Indonesia' },
  { code: 'vnm', label: 'Vietnam' },
  { code: 'mys', label: 'Malaysia' },
  { code: 'chn', label: 'China' },
  { code: 'jpn', label: 'Japan' },
  { code: 'kor', label: 'South Korea' },
  { code: 'twn', label: 'Taiwan' },
  { code: 'mmr', label: 'Myanmar' },
  { code: 'khm', label: 'Cambodia' },

  // Americas
  { code: 'usa', label: 'United States' },
  { code: 'can', label: 'Canada' },
  { code: 'bra', label: 'Brazil' },
  { code: 'mex', label: 'Mexico' },
  { code: 'col', label: 'Colombia' },
  { code: 'arg', label: 'Argentina' },
  { code: 'per', label: 'Peru' },
  { code: 'chl', label: 'Chile' },

  // Oceania
  { code: 'aus', label: 'Australia' },
  { code: 'nzl', label: 'New Zealand' },
];

// ─── Destination Countries (Going To) ────────────────────────────────────────

export const DESTINATION_COUNTRIES: VfsCountry[] = [
  // Schengen Zone
  { code: 'aut', label: 'Austria' },
  { code: 'bel', label: 'Belgium' },
  { code: 'hrv', label: 'Croatia' },
  { code: 'cze', label: 'Czech Republic' },
  { code: 'dnk', label: 'Denmark' },
  { code: 'est', label: 'Estonia' },
  { code: 'fin', label: 'Finland' },
  { code: 'fra', label: 'France' },
  { code: 'deu', label: 'Germany' },
  { code: 'grc', label: 'Greece' },
  { code: 'hun', label: 'Hungary' },
  { code: 'isl', label: 'Iceland' },
  { code: 'ita', label: 'Italy' },
  { code: 'lva', label: 'Latvia' },
  { code: 'ltu', label: 'Lithuania' },
  { code: 'lux', label: 'Luxembourg' },
  { code: 'mlt', label: 'Malta' },
  { code: 'nld', label: 'Netherlands' },
  { code: 'nor', label: 'Norway' },
  { code: 'pol', label: 'Poland' },
  { code: 'prt', label: 'Portugal' },
  { code: 'svk', label: 'Slovakia' },
  { code: 'svn', label: 'Slovenia' },
  { code: 'esp', label: 'Spain' },
  { code: 'swe', label: 'Sweden' },
  { code: 'che', label: 'Switzerland' },
  { code: 'lie', label: 'Liechtenstein' },

  // Non-Schengen Europe
  { code: 'irl', label: 'Ireland' },
  { code: 'rou', label: 'Romania' },
  { code: 'bgr', label: 'Bulgaria' },
  { code: 'cyp', label: 'Cyprus' },
  { code: 'gbr', label: 'United Kingdom' },

  // Rest of World
  { code: 'can', label: 'Canada' },
  { code: 'aus', label: 'Australia' },
  { code: 'nzl', label: 'New Zealand' },
  { code: 'zaf', label: 'South Africa' },
  { code: 'chn', label: 'China' },
  { code: 'jpn', label: 'Japan' },
  { code: 'tha', label: 'Thailand' },
  { code: 'are', label: 'United Arab Emirates' },
  { code: 'bra', label: 'Brazil' },
  { code: 'tur', label: 'Turkey' },
  { code: 'ind', label: 'India' },
  { code: 'usa', label: 'United States' },
];

// ─── Application Centres (Cities) per Source Country ─────────────────────────

export const APPLICATION_CENTRES: Record<string, VfsCentre[]> = {
  // ── United Kingdom ───────────────────────────────────────────────────────
  gbr: [
    { id: 'london',     label: 'London',     address: '66 Wilson St, London EC2A 2BT' },
    { id: 'manchester', label: 'Manchester',  address: 'Peter House, Oxford St, Manchester M1 5AN' },
    { id: 'edinburgh',  label: 'Edinburgh',  address: '1 Renshaw Place, Edinburgh EH16 3BT' },
  ],

  // ── United States ────────────────────────────────────────────────────────
  usa: [
    { id: 'new_york',       label: 'New York',       address: '145 W 45th St, New York, NY 10036' },
    { id: 'washington_dc',  label: 'Washington DC',  address: '1825 Connecticut Ave NW, Washington, DC 20009' },
    { id: 'san_francisco',  label: 'San Francisco',  address: '44 Montgomery St, San Francisco, CA 94104' },
    { id: 'los_angeles',    label: 'Los Angeles',    address: '6220 W 3rd St, Los Angeles, CA 90036' },
    { id: 'chicago',        label: 'Chicago',        address: '455 N Cityfront Plaza Dr, Chicago, IL 60611' },
    { id: 'houston',        label: 'Houston',        address: '1990 Post Oak Blvd, Houston, TX 77056' },
    { id: 'atlanta',        label: 'Atlanta',        address: '2 Ravinia Dr, Atlanta, GA 30346' },
    { id: 'seattle',        label: 'Seattle',        address: '600 Stewart St, Seattle, WA 98101' },
  ],

  // ── India ────────────────────────────────────────────────────────────────
  ind: [
    { id: 'new_delhi',  label: 'New Delhi',   address: 'Shivaji Stadium Metro Station, New Delhi' },
    { id: 'mumbai',     label: 'Mumbai',      address: 'Trade Centre, BKC, Mumbai 400051' },
    { id: 'chennai',    label: 'Chennai',     address: 'Taylors Rd, Kilpauk, Chennai 600010' },
    { id: 'kolkata',    label: 'Kolkata',     address: 'Merlin Infinite, DN-51, Sector V, Kolkata' },
    { id: 'bangalore',  label: 'Bengaluru',   address: 'Prestige Shantiniketan, Whitefield' },
    { id: 'hyderabad',  label: 'Hyderabad',   address: 'Greenlands, Begumpet, Hyderabad' },
    { id: 'pune',       label: 'Pune',        address: 'Lunkad Sky Cruise, Viman Nagar, Pune' },
    { id: 'ahmedabad',  label: 'Ahmedabad',   address: 'Navrangpura, Ahmedabad 380009' },
    { id: 'chandigarh', label: 'Chandigarh',  address: 'SCO 54-55, Sector 17A, Chandigarh' },
    { id: 'jaipur',     label: 'Jaipur',      address: 'Crystal IT Park, Bais Godam, Jaipur' },
    { id: 'kochi',      label: 'Kochi',       address: 'Lulu Cyber Tower, Infopark, Kochi' },
    { id: 'jalandhar',  label: 'Jalandhar',   address: 'Pathankot Bypass Road, Jalandhar' },
    { id: 'goa',        label: 'Goa (Panjim)', address: 'Patto Plaza, Panjim, Goa' },
    { id: 'lucknow',    label: 'Lucknow',     address: 'Vibhuti Khand, Gomti Nagar, Lucknow' },
    { id: 'coimbatore', label: 'Coimbatore',   address: 'DB Road, RS Puram, Coimbatore' },
  ],

  // ── Pakistan ─────────────────────────────────────────────────────────────
  pak: [
    { id: 'islamabad', label: 'Islamabad',  address: 'Diplomatic Enclave, Islamabad' },
    { id: 'karachi',   label: 'Karachi',    address: 'FTC Building, Shahrah-e-Faisal, Karachi' },
    { id: 'lahore',    label: 'Lahore',     address: 'Fortress Square, Lahore Cantt.' },
  ],

  // ── UAE ──────────────────────────────────────────────────────────────────
  are: [
    { id: 'abu_dhabi', label: 'Abu Dhabi',  address: 'Al Nahyan Camp Area, Abu Dhabi' },
    { id: 'dubai',     label: 'Dubai',      address: 'Wafi Mall, Oud Metha, Dubai' },
  ],

  // ── Saudi Arabia ─────────────────────────────────────────────────────────
  sau: [
    { id: 'riyadh',  label: 'Riyadh',   address: 'Olaya District, Riyadh' },
    { id: 'jeddah',  label: 'Jeddah',   address: 'Al Zahra District, Jeddah' },
    { id: 'khobar',  label: 'Al Khobar', address: 'Al Khobar Corniche' },
  ],

  // ── Qatar ────────────────────────────────────────────────────────────────
  qat: [
    { id: 'doha',  label: 'Doha',  address: 'Al Matar Area, Doha' },
  ],

  // ── Kuwait ───────────────────────────────────────────────────────────────
  kwt: [
    { id: 'kuwait_city', label: 'Kuwait City', address: 'Sharq, Kuwait City' },
  ],

  // ── Bahrain ──────────────────────────────────────────────────────────────
  bhr: [
    { id: 'manama', label: 'Manama', address: 'Seef District, Manama' },
  ],

  // ── Oman ─────────────────────────────────────────────────────────────────
  omn: [
    { id: 'muscat', label: 'Muscat', address: 'CBD Area, Muscat' },
  ],

  // ── Nigeria ──────────────────────────────────────────────────────────────
  nga: [
    { id: 'lagos', label: 'Lagos',  address: 'Victoria Island, Lagos' },
    { id: 'abuja', label: 'Abuja',  address: 'Central Area, Abuja' },
  ],

  // ── South Africa ─────────────────────────────────────────────────────────
  zaf: [
    { id: 'pretoria',  label: 'Pretoria',   address: 'Brooklyn, Pretoria' },
    { id: 'cape_town', label: 'Cape Town',  address: 'Foreshore, Cape Town' },
    { id: 'durban',    label: 'Durban',     address: 'Umhlanga, Durban' },
    { id: 'sandton',   label: 'Sandton (Johannesburg)', address: 'Sandton City, Johannesburg' },
  ],

  // ── Kenya ────────────────────────────────────────────────────────────────
  ken: [
    { id: 'nairobi', label: 'Nairobi', address: 'ABC Place, Westlands, Nairobi' },
  ],

  // ── Egypt ────────────────────────────────────────────────────────────────
  egy: [
    { id: 'cairo',      label: 'Cairo',      address: 'New Cairo, 5th Settlement' },
    { id: 'alexandria', label: 'Alexandria', address: 'Smouha, Alexandria' },
  ],

  // ── Ghana ────────────────────────────────────────────────────────────────
  gha: [
    { id: 'accra', label: 'Accra', address: 'Ridge Area, Accra' },
  ],

  // ── Morocco ──────────────────────────────────────────────────────────────
  mar: [
    { id: 'casablanca', label: 'Casablanca', address: 'Maârif, Casablanca' },
    { id: 'rabat',      label: 'Rabat',      address: 'Agdal, Rabat' },
  ],

  // ── Angola ───────────────────────────────────────────────────────────────
  ago: [
    { id: 'luanda', label: 'Luanda', address: 'Maianga, Luanda' },
  ],

  // ── Ethiopia ─────────────────────────────────────────────────────────────
  eth: [
    { id: 'addis_ababa', label: 'Addis Ababa', address: 'Bole Sub City, Addis Ababa' },
  ],

  // ── Tanzania ─────────────────────────────────────────────────────────────
  tza: [
    { id: 'dar_es_salaam', label: 'Dar es Salaam', address: 'Oyster Bay, Dar es Salaam' },
  ],

  // ── Bangladesh ───────────────────────────────────────────────────────────
  bgd: [
    { id: 'dhaka',      label: 'Dhaka',      address: 'Gulshan 2, Dhaka' },
    { id: 'chittagong', label: 'Chittagong', address: 'Agrabad, Chittagong' },
    { id: 'sylhet',     label: 'Sylhet',     address: 'Zindabazar, Sylhet' },
  ],

  // ── Sri Lanka ────────────────────────────────────────────────────────────
  lka: [
    { id: 'colombo', label: 'Colombo', address: 'Havelock City, Colombo 05' },
  ],

  // ── Nepal ────────────────────────────────────────────────────────────────
  npl: [
    { id: 'kathmandu', label: 'Kathmandu', address: 'Kamaladi, Kathmandu' },
  ],

  // ── Philippines ──────────────────────────────────────────────────────────
  phl: [
    { id: 'manila', label: 'Manila', address: 'Makati City, Metro Manila' },
    { id: 'cebu',   label: 'Cebu',   address: 'Cebu City, Cebu' },
  ],

  // ── Thailand ─────────────────────────────────────────────────────────────
  tha: [
    { id: 'bangkok', label: 'Bangkok', address: 'Sathorn, Bangkok' },
  ],

  // ── Indonesia ────────────────────────────────────────────────────────────
  idn: [
    { id: 'jakarta', label: 'Jakarta', address: 'Kuningan, South Jakarta' },
  ],

  // ── Vietnam ──────────────────────────────────────────────────────────────
  vnm: [
    { id: 'hanoi',         label: 'Hanoi',          address: 'Hoan Kiem, Hanoi' },
    { id: 'ho_chi_minh',   label: 'Ho Chi Minh City', address: 'District 1, HCMC' },
  ],

  // ── Malaysia ─────────────────────────────────────────────────────────────
  mys: [
    { id: 'kuala_lumpur', label: 'Kuala Lumpur', address: 'Menara MITI, KL Sentral' },
  ],

  // ── China ────────────────────────────────────────────────────────────────
  chn: [
    { id: 'beijing',   label: 'Beijing',   address: 'Chaoyang District, Beijing' },
    { id: 'shanghai',  label: 'Shanghai',  address: 'Jing\'an District, Shanghai' },
    { id: 'guangzhou', label: 'Guangzhou', address: 'Tianhe District, Guangzhou' },
    { id: 'chengdu',   label: 'Chengdu',   address: 'Jinjiang District, Chengdu' },
  ],

  // ── Japan ────────────────────────────────────────────────────────────────
  jpn: [
    { id: 'tokyo', label: 'Tokyo', address: 'Minato-ku, Tokyo' },
    { id: 'osaka', label: 'Osaka', address: 'Chuo-ku, Osaka' },
  ],

  // ── South Korea ──────────────────────────────────────────────────────────
  kor: [
    { id: 'seoul', label: 'Seoul', address: 'Jung-gu, Seoul' },
  ],

  // ── Canada ───────────────────────────────────────────────────────────────
  can: [
    { id: 'toronto',   label: 'Toronto',   address: '55 Town Centre Ct, Toronto' },
    { id: 'vancouver', label: 'Vancouver', address: '535 Hornby St, Vancouver' },
    { id: 'ottawa',    label: 'Ottawa',    address: '116 Albert St, Ottawa' },
    { id: 'montreal',  label: 'Montreal',  address: '1550 Metcalfe, Montreal' },
  ],

  // ── Brazil ───────────────────────────────────────────────────────────────
  bra: [
    { id: 'sao_paulo',      label: 'São Paulo',       address: 'Itaim Bibi, São Paulo' },
    { id: 'rio_de_janeiro', label: 'Rio de Janeiro',  address: 'Centro, Rio de Janeiro' },
    { id: 'brasilia',       label: 'Brasília',        address: 'Asa Sul, Brasília' },
  ],

  // ── Mexico ───────────────────────────────────────────────────────────────
  mex: [
    { id: 'mexico_city', label: 'Mexico City', address: 'Polanco, Mexico City' },
  ],

  // ── Australia ────────────────────────────────────────────────────────────
  aus: [
    { id: 'sydney',    label: 'Sydney',    address: 'George St, Sydney NSW' },
    { id: 'melbourne', label: 'Melbourne', address: 'Collins St, Melbourne VIC' },
    { id: 'perth',     label: 'Perth',     address: 'St Georges Tce, Perth WA' },
  ],

  // ── New Zealand ──────────────────────────────────────────────────────────
  nzl: [
    { id: 'auckland', label: 'Auckland', address: 'Queen St, Auckland' },
  ],

  // ── Turkey ───────────────────────────────────────────────────────────────
  tur: [
    { id: 'istanbul',  label: 'Istanbul',  address: 'Gayrettepe, Istanbul' },
    { id: 'ankara',    label: 'Ankara',    address: 'Çankaya, Ankara' },
    { id: 'izmir',     label: 'Izmir',     address: 'Alsancak, Izmir' },
    { id: 'antalya',   label: 'Antalya',   address: 'Muratpaşa, Antalya' },
  ],

  // ── Jordan ───────────────────────────────────────────────────────────────
  jor: [
    { id: 'amman', label: 'Amman', address: 'Abdoun, Amman' },
  ],

  // ── Lebanon ──────────────────────────────────────────────────────────────
  lbn: [
    { id: 'beirut', label: 'Beirut', address: 'Hamra, Beirut' },
  ],

  // ── Russia ───────────────────────────────────────────────────────────────
  rus: [
    { id: 'moscow',          label: 'Moscow',           address: 'Tverskaya, Moscow' },
    { id: 'saint_petersburg', label: 'Saint Petersburg', address: 'Nevsky Prospekt, St Petersburg' },
  ],

  // ── Germany ──────────────────────────────────────────────────────────────
  deu: [
    { id: 'berlin',    label: 'Berlin',    address: 'Mitte, Berlin' },
    { id: 'munich',    label: 'Munich',    address: 'Maxvorstadt, Munich' },
    { id: 'frankfurt', label: 'Frankfurt', address: 'Innenstadt, Frankfurt' },
    { id: 'dusseldorf', label: 'Düsseldorf', address: 'Stadtmitte, Düsseldorf' },
  ],

  // ── France ───────────────────────────────────────────────────────────────
  fra: [
    { id: 'paris',     label: 'Paris',      address: '8th Arrondissement, Paris' },
    { id: 'lyon',      label: 'Lyon',       address: 'Presqu\'île, Lyon' },
    { id: 'marseille', label: 'Marseille',  address: 'Centre-ville, Marseille' },
    { id: 'strasbourg', label: 'Strasbourg', address: 'Centre, Strasbourg' },
  ],

  // ── Italy ────────────────────────────────────────────────────────────────
  ita: [
    { id: 'rome',   label: 'Rome',   address: 'Via del Corso, Rome' },
    { id: 'milan',  label: 'Milan',  address: 'Centro Storico, Milan' },
  ],

  // ── Spain ────────────────────────────────────────────────────────────────
  esp: [
    { id: 'madrid',    label: 'Madrid',    address: 'Salamanca, Madrid' },
    { id: 'barcelona', label: 'Barcelona', address: 'Eixample, Barcelona' },
  ],

  // ── Colombia ─────────────────────────────────────────────────────────────
  col: [
    { id: 'bogota', label: 'Bogotá', address: 'Chapinero, Bogotá' },
  ],

  // ── Argentina ────────────────────────────────────────────────────────────
  arg: [
    { id: 'buenos_aires', label: 'Buenos Aires', address: 'Microcentro, Buenos Aires' },
  ],

  // ── Peru ─────────────────────────────────────────────────────────────────
  per: [
    { id: 'lima', label: 'Lima', address: 'San Isidro, Lima' },
  ],

  // ── Iraq ─────────────────────────────────────────────────────────────────
  irq: [
    { id: 'baghdad', label: 'Baghdad',  address: 'International Zone, Baghdad' },
    { id: 'erbil',   label: 'Erbil',    address: 'Ainkawa, Erbil' },
  ],

  // ── Tunisia ──────────────────────────────────────────────────────────────
  tun: [
    { id: 'tunis', label: 'Tunis', address: 'Les Berges du Lac, Tunis' },
  ],

  // ── Algeria ──────────────────────────────────────────────────────────────
  dza: [
    { id: 'algiers', label: 'Algiers', address: 'Hydra, Algiers' },
    { id: 'oran',    label: 'Oran',    address: 'Centre, Oran' },
  ],

  // ── Cameroon ─────────────────────────────────────────────────────────────
  cmr: [
    { id: 'yaounde', label: 'Yaoundé', address: 'Centre, Yaoundé' },
    { id: 'douala',  label: 'Douala',  address: 'Bonanjo, Douala' },
  ],

  // ── Senegal ──────────────────────────────────────────────────────────────
  sen: [
    { id: 'dakar', label: 'Dakar', address: 'Plateau, Dakar' },
  ],

  // ── Ukraine ──────────────────────────────────────────────────────────────
  ukr: [
    { id: 'kyiv',  label: 'Kyiv',  address: 'Shevchenkivskyi, Kyiv' },
    { id: 'lviv',  label: 'Lviv',  address: 'Halytskyi, Lviv' },
    { id: 'odessa', label: 'Odessa', address: 'Primorskyi, Odessa' },
  ],

  // ── Serbia ───────────────────────────────────────────────────────────────
  srb: [
    { id: 'belgrade', label: 'Belgrade', address: 'Stari Grad, Belgrade' },
  ],

  // ── Romania ──────────────────────────────────────────────────────────────
  rou: [
    { id: 'bucharest', label: 'Bucharest', address: 'Sector 1, Bucharest' },
  ],

  // ── Taiwan, Myanmar, Cambodia, etc. — single centre per country ─────────
  twn: [{ id: 'taipei', label: 'Taipei', address: 'Xinyi District, Taipei' }],
  mmr: [{ id: 'yangon', label: 'Yangon', address: 'Pabedan Township, Yangon' }],
  khm: [{ id: 'phnom_penh', label: 'Phnom Penh', address: 'Chamkarmon, Phnom Penh' }],
  chl: [{ id: 'santiago', label: 'Santiago', address: 'Providencia, Santiago' }],
};

// ─── Visa Type Categories per Destination ────────────────────────────────────

/** Schengen short-stay visa types — shared across all 27 Schengen destinations */
const SCHENGEN_SHORT_STAY: VfsVisaType[] = [
  { code: 'TOURIST',          label: 'Tourist',                           category: 'short-stay' },
  { code: 'BUSINESS',         label: 'Business / Conference',            category: 'short-stay' },
  { code: 'VISIT_FAMILY',     label: 'Visiting Family or Friends',       category: 'short-stay' },
  { code: 'MEDICAL',          label: 'Medical Treatment',                category: 'short-stay' },
  { code: 'CULTURAL',         label: 'Cultural / Sports / Film Crew',    category: 'short-stay' },
  { code: 'TRANSIT',          label: 'Transit (Airport)',                 category: 'short-stay' },
  { code: 'SEAMEN',           label: 'Transit (Seamen)',                  category: 'short-stay' },
  { code: 'STUDY_SHORT',      label: 'Short-term Study / Training',       category: 'short-stay' },
  { code: 'EEA_FAMILY',       label: 'EEA/EU Family Member',             category: 'short-stay' },
  { code: 'MINORS',           label: 'Minors',                           category: 'short-stay' },
  { code: 'OFFICIAL',         label: 'Official / Diplomatic',            category: 'short-stay' },
];

/** Long-stay visa types — common across many Schengen countries */
const SCHENGEN_LONG_STAY: VfsVisaType[] = [
  { code: 'WORK',             label: 'Work Visa (National)',              category: 'long-stay' },
  { code: 'STUDY',            label: 'Study Visa (National)',             category: 'long-stay' },
  { code: 'FAMILY_REUNION',   label: 'Family Reunion / Reunification',   category: 'long-stay' },
  { code: 'RESEARCH',         label: 'Scientific Research',               category: 'long-stay' },
  { code: 'AU_PAIR',          label: 'Au Pair',                           category: 'long-stay' },
  { code: 'INTERNSHIP',       label: 'Internship / Traineeship',         category: 'long-stay' },
  { code: 'RESIDENCE',        label: 'Residence Permit',                  category: 'long-stay' },
];

/** All Schengen ISO codes for type mapping */
const SCHENGEN_CODES = [
  'aut', 'bel', 'hrv', 'cze', 'dnk', 'est', 'fin', 'fra', 'deu', 'grc',
  'hun', 'isl', 'ita', 'lva', 'ltu', 'lux', 'mlt', 'nld', 'nor', 'pol',
  'prt', 'svk', 'svn', 'esp', 'swe', 'che', 'lie',
];

// Country-specific visa type extensions
const PORTUGAL_EXTRA: VfsVisaType[] = [
  { code: 'D7',               label: 'D7 — Passive Income / Retirement', category: 'national' },
  { code: 'D8',               label: 'D8 — Digital Nomad',               category: 'national' },
  { code: 'D2',               label: 'D2 — Entrepreneur / Independent',  category: 'national' },
  { code: 'D1',               label: 'D1 — Salaried Worker',             category: 'national' },
  { code: 'D3',               label: 'D3 — Highly Qualified',            category: 'national' },
  { code: 'D4',               label: 'D4 — Study (National)',            category: 'national' },
  { code: 'D5',               label: 'D5 — Voluntary Work',             category: 'national' },
  { code: 'D6',               label: 'D6 — Family Reunion',             category: 'national' },
  { code: 'GOLDEN_VISA',      label: 'Golden Visa (Investment)',         category: 'national' },
  { code: 'MEDICAL_LONG',     label: 'Medical Treatment (Extended)',     category: 'national' },
  { code: 'TECH_VISA',        label: 'Tech Visa (Startup)',              category: 'national' },
];

const GERMANY_EXTRA: VfsVisaType[] = [
  { code: 'JOB_SEEKER',       label: 'Job Seeker Visa',                 category: 'national' },
  { code: 'FREELANCER',       label: 'Freelancer / Self-Employment',    category: 'national' },
  { code: 'LANGUAGE',          label: 'Language Course',                 category: 'national' },
  { code: 'BLUE_CARD',        label: 'EU Blue Card',                    category: 'national' },
  { code: 'VOCATIONAL',       label: 'Vocational Training',             category: 'national' },
];

const FRANCE_EXTRA: VfsVisaType[] = [
  { code: 'TALENT_PASSPORT',  label: 'Talent Passport',                 category: 'national' },
  { code: 'VLS_TS',           label: 'VLS-TS (Long Stay as Residence)', category: 'national' },
  { code: 'STUDENT_LONG',     label: 'Student (VLS-TS)',                category: 'national' },
  { code: 'WORKING_HOLIDAY',  label: 'Working Holiday',                 category: 'national' },
];

const ITALY_EXTRA: VfsVisaType[] = [
  { code: 'ELECTIVE_RES',     label: 'Elective Residence',              category: 'national' },
  { code: 'DIGITAL_NOMAD_IT', label: 'Digital Nomad (Italy)',           category: 'national' },
  { code: 'SELF_EMPLOYMENT',  label: 'Self-Employment',                 category: 'national' },
  { code: 'SEASONAL_WORK',    label: 'Seasonal Work',                   category: 'national' },
];

const SPAIN_EXTRA: VfsVisaType[] = [
  { code: 'NON_LUCRATIVE',    label: 'Non-Lucrative Visa',              category: 'national' },
  { code: 'DIGITAL_NOMAD_ES', label: 'Digital Nomad (Spain)',           category: 'national' },
  { code: 'ENTREPRENEUR_ES',  label: 'Entrepreneur Visa',               category: 'national' },
  { code: 'GOLDEN_VISA_ES',   label: 'Golden Visa / Investor',         category: 'national' },
];

const NETHERLANDS_EXTRA: VfsVisaType[] = [
  { code: 'MVV',              label: 'MVV (Entry Visa)',                 category: 'national' },
  { code: 'ORIENTATION',      label: 'Search Year / Orientation',       category: 'national' },
  { code: 'KNOWLEDGE_MIG',    label: 'Highly Skilled Migrant',          category: 'national' },
];

// Non-Schengen destination visa types
const UK_VISA_TYPES: VfsVisaType[] = [
  { code: 'STANDARD_VISITOR', label: 'Standard Visitor',                 category: 'short-stay' },
  { code: 'BUSINESS_VISITOR', label: 'Business Visitor',                 category: 'short-stay' },
  { code: 'FAMILY_VISITOR',   label: 'Family Visitor',                   category: 'short-stay' },
  { code: 'CHILD_VISITOR',    label: 'Child Visitor',                    category: 'short-stay' },
  { code: 'TRANSIT_UK',       label: 'Transit Visa',                     category: 'short-stay' },
  { code: 'MARRIAGE_VISITOR', label: 'Marriage / Civil Partnership Visitor', category: 'short-stay' },
  { code: 'STUDENT_UK',       label: 'Student Visa (Tier 4)',            category: 'long-stay' },
  { code: 'SKILLED_WORKER',   label: 'Skilled Worker',                   category: 'long-stay' },
  { code: 'FAMILY_UK',        label: 'Family Visa (Spouse/Partner)',     category: 'long-stay' },
  { code: 'SETTLEMENT',       label: 'Settlement / ILR',                 category: 'long-stay' },
  { code: 'GLOBAL_TALENT',    label: 'Global Talent',                    category: 'long-stay' },
  { code: 'INNOVATOR',        label: 'Innovator Founder',                category: 'long-stay' },
];

const CANADA_VISA_TYPES: VfsVisaType[] = [
  { code: 'VISITOR_CAN',      label: 'Visitor Visa (TRV)',              category: 'short-stay' },
  { code: 'STUDY_CAN',        label: 'Study Permit',                    category: 'long-stay' },
  { code: 'WORK_CAN',         label: 'Work Permit',                     category: 'long-stay' },
  { code: 'PR_CAN',           label: 'Permanent Residence',             category: 'long-stay' },
  { code: 'TRANSIT_CAN',      label: 'Transit Visa',                    category: 'short-stay' },
  { code: 'SUPER_VISA',       label: 'Super Visa (Parents/Grandparents)', category: 'long-stay' },
];

const AUSTRALIA_VISA_TYPES: VfsVisaType[] = [
  { code: 'VISITOR_AUS',      label: 'Visitor Visa (600)',              category: 'short-stay' },
  { code: 'STUDENT_AUS',      label: 'Student Visa (500)',              category: 'long-stay' },
  { code: 'WORK_HOLIDAY_AUS', label: 'Working Holiday (417/462)',       category: 'long-stay' },
  { code: 'SKILLED_AUS',      label: 'Skilled Visa',                    category: 'long-stay' },
  { code: 'PARTNER_AUS',      label: 'Partner Visa',                    category: 'long-stay' },
  { code: 'TRANSIT_AUS',      label: 'Transit Visa (771)',              category: 'short-stay' },
];

const GENERIC_VISA_TYPES: VfsVisaType[] = [
  { code: 'TOURIST',          label: 'Tourist / Visitor Visa',           category: 'short-stay' },
  { code: 'BUSINESS',         label: 'Business Visa',                    category: 'short-stay' },
  { code: 'TRANSIT',          label: 'Transit Visa',                     category: 'short-stay' },
  { code: 'STUDENT',          label: 'Student Visa',                     category: 'long-stay' },
  { code: 'WORK',             label: 'Work Visa',                        category: 'long-stay' },
  { code: 'FAMILY',           label: 'Family / Dependant Visa',          category: 'long-stay' },
  { code: 'RESIDENCE',        label: 'Residence Permit',                  category: 'long-stay' },
];

/**
 * Build the full lookup: destination ISO code → visa types available.
 */
function buildVisaTypesMap(): Record<string, VfsVisaType[]> {
  const map: Record<string, VfsVisaType[]> = {};

  // All Schengen countries get the base Schengen set + generic long-stay
  for (const code of SCHENGEN_CODES) {
    map[code] = [...SCHENGEN_SHORT_STAY, ...SCHENGEN_LONG_STAY];
  }

  // Country-specific extensions
  map['prt'] = [...map['prt'], ...PORTUGAL_EXTRA];
  map['deu'] = [...map['deu'], ...GERMANY_EXTRA];
  map['fra'] = [...map['fra'], ...FRANCE_EXTRA];
  map['ita'] = [...map['ita'], ...ITALY_EXTRA];
  map['esp'] = [...map['esp'], ...SPAIN_EXTRA];
  map['nld'] = [...map['nld'], ...NETHERLANDS_EXTRA];

  // Non-Schengen
  map['gbr'] = UK_VISA_TYPES;
  map['can'] = CANADA_VISA_TYPES;
  map['aus'] = AUSTRALIA_VISA_TYPES;
  map['irl'] = [...SCHENGEN_SHORT_STAY, ...SCHENGEN_LONG_STAY]; // Ireland uses similar categories
  map['rou'] = [...SCHENGEN_SHORT_STAY, ...SCHENGEN_LONG_STAY];
  map['bgr'] = [...SCHENGEN_SHORT_STAY, ...SCHENGEN_LONG_STAY];
  map['cyp'] = [...SCHENGEN_SHORT_STAY, ...SCHENGEN_LONG_STAY];

  return map;
}

const VISA_TYPES_MAP = buildVisaTypesMap();

// ─── Public API ──────────────────────────────────────────────────────────────

/** Get all source countries (sorted by label). */
export function getSourceCountries(): VfsCountry[] {
  return [...SOURCE_COUNTRIES].sort((a, b) => a.label.localeCompare(b.label));
}

/** Get all destination countries (sorted by label). */
export function getDestinationCountries(): VfsCountry[] {
  return [...DESTINATION_COUNTRIES].sort((a, b) => a.label.localeCompare(b.label));
}

/** Get VFS application centres for a source country. */
export function getCentres(sourceCode: string): VfsCentre[] {
  return APPLICATION_CENTRES[sourceCode.toLowerCase()] ?? [];
}

/** Get visa types for a destination country. Falls back to the generic set. */
export function getVisaTypes(destCode: string): VfsVisaType[] {
  return VISA_TYPES_MAP[destCode.toLowerCase()] ?? GENERIC_VISA_TYPES;
}

/**
 * Resolve a source key to its ISO 3166-1 alpha-3 code.
 * Accepts both the direct ISO code and legacy short keys (uk, usa, angola).
 */
export function resolveSourceCode(source: string): string {
  const lower = source.toLowerCase();
  // Legacy mappings for backward compatibility
  const LEGACY: Record<string, string> = { uk: 'gbr', usa: 'usa', angola: 'ago' };
  if (LEGACY[lower]) return LEGACY[lower];
  // Check if it's already a valid code
  if (SOURCE_COUNTRIES.find(c => c.code === lower)) return lower;
  throw new Error(`Unknown source country: ${source}`);
}

/**
 * Resolve a destination key to its ISO 3166-1 alpha-3 code.
 * Accepts both the direct ISO code and legacy short keys (portugal, brazil).
 */
export function resolveDestinationCode(dest: string): string {
  const lower = dest.toLowerCase();
  // Legacy mappings
  const LEGACY: Record<string, string> = { portugal: 'prt', brazil: 'bra' };
  if (LEGACY[lower]) return LEGACY[lower];
  if (DESTINATION_COUNTRIES.find(c => c.code === lower)) return lower;
  throw new Error(`Unknown destination country: ${dest}`);
}

/** Find a country label by ISO code from either source or destination lists. */
export function getCountryLabel(code: string): string {
  const lower = code.toLowerCase();
  const sc = SOURCE_COUNTRIES.find(c => c.code === lower);
  if (sc) return sc.label;
  const dc = DESTINATION_COUNTRIES.find(c => c.code === lower);
  if (dc) return dc.label;
  return code.toUpperCase();
}

/** Find a centre label by source code + centre id. */
export function getCentreLabel(sourceCode: string, centreId: string): string {
  const centres = getCentres(sourceCode);
  return centres.find(c => c.id === centreId)?.label ?? centreId;
}
