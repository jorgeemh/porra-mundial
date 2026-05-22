// Catálogo de equipos del Mundial 2026 (código FIFA → nombre + emoji bandera)
window.EQUIPOS = {
  MEX: {nombre:"México",            flag:"🇲🇽"},
  KOR: {nombre:"Corea del Sur",     flag:"🇰🇷"},
  RSA: {nombre:"Sudáfrica",         flag:"🇿🇦"},
  CZE: {nombre:"Chequia",           flag:"🇨🇿"},
  CAN: {nombre:"Canadá",            flag:"🇨🇦"},
  QAT: {nombre:"Catar",             flag:"🇶🇦"},
  BIH: {nombre:"Bosnia",            flag:"🇧🇦"},
  SUI: {nombre:"Suiza",             flag:"🇨🇭"},
  BRA: {nombre:"Brasil",            flag:"🇧🇷"},
  HAI: {nombre:"Haití",             flag:"🇭🇹"},
  MAR: {nombre:"Marruecos",         flag:"🇲🇦"},
  SCO: {nombre:"Escocia",           flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿"},
  USA: {nombre:"EE. UU.",           flag:"🇺🇸"},
  AUS: {nombre:"Australia",         flag:"🇦🇺"},
  PAR: {nombre:"Paraguay",          flag:"🇵🇾"},
  TUR: {nombre:"Turquía",           flag:"🇹🇷"},
  GER: {nombre:"Alemania",          flag:"🇩🇪"},
  CIV: {nombre:"Costa de Marfil",   flag:"🇨🇮"},
  CUW: {nombre:"Curazao",           flag:"🇨🇼"},
  ECU: {nombre:"Ecuador",           flag:"🇪🇨"},
  NED: {nombre:"Países Bajos",      flag:"🇳🇱"},
  SWE: {nombre:"Suecia",            flag:"🇸🇪"},
  JPN: {nombre:"Japón",             flag:"🇯🇵"},
  TUN: {nombre:"Túnez",             flag:"🇹🇳"},
  BEL: {nombre:"Bélgica",           flag:"🇧🇪"},
  IRN: {nombre:"Irán",              flag:"🇮🇷"},
  EGY: {nombre:"Egipto",            flag:"🇪🇬"},
  NZL: {nombre:"Nueva Zelanda",     flag:"🇳🇿"},
  ESP: {nombre:"España",            flag:"🇪🇸"},
  KSA: {nombre:"Arabia Saudí",      flag:"🇸🇦"},
  CPV: {nombre:"Cabo Verde",        flag:"🇨🇻"},
  URU: {nombre:"Uruguay",           flag:"🇺🇾"},
  FRA: {nombre:"Francia",           flag:"🇫🇷"},
  IRQ: {nombre:"Irak",              flag:"🇮🇶"},
  SEN: {nombre:"Senegal",           flag:"🇸🇳"},
  NOR: {nombre:"Noruega",           flag:"🇳🇴"},
  ARG: {nombre:"Argentina",         flag:"🇦🇷"},
  AUT: {nombre:"Austria",           flag:"🇦🇹"},
  ALG: {nombre:"Argelia",           flag:"🇩🇿"},
  JOR: {nombre:"Jordania",          flag:"🇯🇴"},
  POR: {nombre:"Portugal",          flag:"🇵🇹"},
  UZB: {nombre:"Uzbekistán",        flag:"🇺🇿"},
  COD: {nombre:"RD Congo",          flag:"🇨🇩"},
  COL: {nombre:"Colombia",          flag:"🇨🇴"},
  ENG: {nombre:"Inglaterra",        flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
  GHA: {nombre:"Ghana",             flag:"🇬🇭"},
  CRO: {nombre:"Croacia",           flag:"🇭🇷"},
  PAN: {nombre:"Panamá",            flag:"🇵🇦"}
};

window.equipo = function(codigo) {
  const e = window.EQUIPOS[codigo];
  if (!e) return { nombre: codigo, flag: "" };
  return e;
};
window.equipoLabel = function(codigo) {
  const e = window.equipo(codigo);
  return `${e.flag} ${e.nombre}`;
};
