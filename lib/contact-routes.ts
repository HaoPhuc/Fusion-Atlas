import { normalize } from "./research";
import type { Person } from "./types";

// Reviewed official group listings. This catalogue supplements live worldwide literature discovery.
const differ = "https://www.differ.nl/research/fusion";
const internships =
  "https://www.differ.nl/working-at/internships-and-thesis-projects";
const tum =
  "https://www.math.cit.tum.de/en/math/research/groups/numerical-methods-plasma-physics/";
const anu =
  "https://physics.anu.edu.au/study/projects/project.php?ProjectID=14";
const wisconsin =
  "https://engineering.wisc.edu/departments/nuclear-engineering-engineering-physics/research/experimental-plasma-physics/";
const tokyo = "https://www.mgs.k.u-tokyo.ac.jp/fusion-pro/en/lab/";
type Listing = {
  role?: string;
  studentEvidence?: string;
  institution: string;
  country: string;
  group: string;
  name: string;
  topics: string;
  source: string;
  route: string;
  instruction: string;
};
const differGroups = [
  [
    "Energy Systems and Control",
    "Matthijs van Berkel",
    "control system identification algorithms plasma control",
  ],
  [
    "Integrated Modelling",
    "Sven Wiesen",
    "simulation modelling multi-scale magnetic confinement",
  ],
  [
    "Plasma Edge Physics and Diagnostics",
    "Ivo Classen",
    "edge diagnostics transport radiation tokamak spectroscopy measurements experimental",
  ],
  [
    "Plasma Material Interactions",
    "Thomas Morgan",
    "materials tungsten divertor heat exhaust plasma facing components wall",
  ],
  [
    "Plasma Micro-Turbulence",
    "M.J. Pueschel",
    "turbulence gyrokinetic plasma instability computational",
  ],
  [
    "Radiation Induced Defect Research",
    "B. Tyburska-Pueschel",
    "radiation defects corrosion materials irradiation",
  ],
];
export const listings: Listing[] = [
  {
    name: "Cormac Corr",
    role: "project supervisor",
    group: "MAGPIE plasma–surface interactions project",
    institution: "Australian National University",
    country: "AU",
    topics:
      "materials surface spectroscopy optical diagnostics erosion fuel retention experimental modelling simulation heat transport",
    source: anu,
    route: anu,
    studentEvidence:
      "The project page explicitly includes second- or third-year PhB students, third-year projects and vacation scholars.",
    instruction:
      "Use the supervisor link on the MAGPIE project page. Ask which project formats and dates are available to you.",
  },
  {
    name: "Oliver Schmitz",
    group: "Plasma edge and wall interactions",
    institution: "University of Wisconsin–Madison",
    country: "US",
    topics:
      "stellarator tokamak edge diagnostics spectroscopy plasma material interactions divertor helicon experimental",
    source: wisconsin,
    route: "https://engineering.wisc.edu/directory/profile/oliver-schmitz/",
    instruction:
      "Use the published contact on the faculty profile to enquire about undergraduate projects.",
  },
  {
    name: "Michiaki Inomoto",
    group: "Inomoto laboratory",
    institution: "The University of Tokyo",
    country: "JP",
    topics:
      "tokamak magnetic reconnection experimental particle acceleration heating high beta spherical tokamaks",
    source: tokyo,
    route: "https://www.eeis.t.u-tokyo.ac.jp/en/staff/inomoto-michiaki/",
    instruction:
      "Use the lab link on the faculty profile to ask about visiting undergraduates. The listed degree programme is for graduate students.",
  },
  ...differGroups.map(([group, name, topics]) => ({
    group,
    name,
    topics,
    institution: "Dutch Institute for Fundamental Energy Research",
    country: "NL",
    studentEvidence:
      "DIFFER invites project enquiries from students. It generally requires EU nationality or enrolment at a Dutch university unless the listing specifies an exception.",
    source: differ,
    route: internships,
    instruction:
      "Use DIFFER’s internship instructions to enquire with the group leader about a tailored project.",
  })),
  {
    group: "Numerical Methods for Plasma Physics",
    name: "Eric Sonnendrücker",
    topics:
      "numerical methods simulation computational algorithms high performance computing stellarator MHD",
    institution: "Technical University of Munich",
    country: "DE",
    source: tum,
    route: tum,
    instruction:
      "Open the leader’s profile from the group page and enquire about undergraduate supervision.",
  },
];
export const reviewedOn = "2026-11-18";
export const programmes = [
  {
    institution: "MIT Plasma Science and Fusion Center",
    country: "US",
    name: "Undergraduate Research Opportunities Program",
    topics:
      "plasma fusion materials experimental magnetic confinement tokamak engineering",
    note: "MIT and Wellesley undergraduates apply through the central UROP office. Use the supervisor for project questions.",
    url: "https://www.psfc.mit.edu/undergrad-education/urop/",
  },
  {
    institution: "Princeton Plasma Physics Laboratory",
    country: "US",
    name: "Science Undergraduate Laboratory Internships",
    topics:
      "plasma fusion computational physics theory tokamak experimental engineering",
    note: "Use the SULI application. The programme lists enrolment, coursework and US citizenship or permanent-residency requirements.",
    url: "https://www.pppl.gov/science-undergraduate-laboratory-internships-suli",
  },
  {
    institution: "UK Atomic Energy Authority",
    country: "GB",
    name: "Student placements",
    topics: "fusion engineering materials experimental energy industrial",
    note: "Check placement listings for students at UK universities. Summer and industrial placements have different durations.",
    url: "https://careers.ukaea.uk/early-careers/placements-and-work-experience/",
  },
];
export function matchesInstitution(actual: string, filter?: string) {
  if (!filter) return true;
  const a = normalize(actual).replace(/^the /, ""),
    b = normalize(filter).replace(/^the /, "");
  const aliases = [
    [
      "massachusetts institute of technology",
      "mit plasma science and fusion center",
    ],
    ["princeton university", "princeton plasma physics laboratory"],
    ["technical university of munich", "technische universitat munchen"],
    ["differ", "dutch institute for fundamental energy research"],
  ];
  return (
    a === b || aliases.some((group) => group.includes(a) && group.includes(b))
  );
}
export function listedPerson(l: Listing): Person {
  return {
    key: "group:" + normalize(l.group) + ":" + normalize(l.name),
    name: l.name,
    institutions: [
      { id: l.institution, name: l.institution, country: l.country },
    ],
    works: [],
    score: 0,
    matched: [],
    corresponding: false,
    identity: "Named on the official research group page",
    profileUrl: l.source,
    officialGroup: l.group,
    officialRoleSource: l.source,
  };
}
