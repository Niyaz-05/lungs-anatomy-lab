/**
 * Human Lungs — SimulationDefinition. Pure data, validated by src/contract/validate.ts in tests
 * and at start-up. Explanations are written for this project and cite their sources; they describe
 * a typical adult and are not clinical guidance. Facts that could not be checked against a cited
 * source are left out; model choices are listed as assumptions.
 */
import type { AnatomicalStructure, SimulationDefinition } from '../contract/schema';

const AIR = ['openstax-airways'] as const;
const LUNG = ['openstax-lungs', 'hra-lung'] as const;

type Side = 'right' | 'left';
interface LobeInfo { id: string; side: Side; label: string; abbr: string }
const LOBES: LobeInfo[] = [
  { id: 'right-upper-lobe', side: 'right', label: 'Right upper lobe', abbr: 'RUL' },
  { id: 'right-middle-lobe', side: 'right', label: 'Right middle lobe', abbr: 'RML' },
  { id: 'right-lower-lobe', side: 'right', label: 'Right lower lobe', abbr: 'RLL' },
  { id: 'left-upper-lobe', side: 'left', label: 'Left upper lobe', abbr: 'LUL' },
  { id: 'left-lower-lobe', side: 'left', label: 'Left lower lobe', abbr: 'LLL' },
];

/** Segment table: [segment id stem, display name, lobe, number]. Bronchus ids follow the same stem. */
const SEGMENTS: [string, string, string, number][] = [
  ['right-apical', 'Apical', 'right-upper-lobe', 1],
  ['right-posterior', 'Posterior', 'right-upper-lobe', 2],
  ['right-anterior', 'Anterior', 'right-upper-lobe', 3],
  ['right-lateral', 'Lateral', 'right-middle-lobe', 4],
  ['right-medial', 'Medial', 'right-middle-lobe', 5],
  ['right-superior', 'Superior', 'right-lower-lobe', 6],
  ['right-medial-basal', 'Medial basal', 'right-lower-lobe', 7],
  ['right-anterior-basal', 'Anterior basal', 'right-lower-lobe', 8],
  ['right-lateral-basal', 'Lateral basal', 'right-lower-lobe', 9],
  ['right-posterior-basal', 'Posterior basal', 'right-lower-lobe', 10],
  ['left-apical', 'Apical', 'left-upper-lobe', 1],
  ['left-posterior', 'Posterior', 'left-upper-lobe', 2],
  ['left-anterior', 'Anterior', 'left-upper-lobe', 3],
  ['left-superior-lingular', 'Superior lingular', 'left-upper-lobe', 4],
  ['left-inferior-lingular', 'Inferior lingular', 'left-upper-lobe', 5],
  ['left-superior', 'Superior', 'left-lower-lobe', 6],
  ['left-medial-basal', 'Medial basal', 'left-lower-lobe', 7],
  ['left-anterior-basal', 'Anterior basal', 'left-lower-lobe', 8],
  ['left-lateral-basal', 'Lateral basal', 'left-lower-lobe', 9],
  ['left-posterior-basal', 'Posterior basal', 'left-lower-lobe', 10],
];

const lobeOf = (id: string) => LOBES.find((l) => l.id === id)!;
const sideWord = (s: Side) => (s === 'right' ? 'Right' : 'Left');
const LOBAR: Record<string, string> = {
  'right-upper-lobe': 'right-upper-lobar-bronchus',
  'right-middle-lobe': 'right-middle-lobar-bronchus',
  'right-lower-lobe': 'right-lower-lobar-bronchus',
  'left-upper-lobe': 'left-upper-lobar-bronchus',
  'left-lower-lobe': 'left-lower-lobar-bronchus',
};

const segmentStructures: AnatomicalStructure[] = SEGMENTS.map(([stem, name, lobe, n]) => {
  const l = lobeOf(lobe);
  const lingula = stem.includes('lingular');
  return {
    id: `${stem}-segment`,
    label: `${sideWord(l.side)} ${name.toLowerCase()} segment (S${n})`,
    synonyms: [`${l.abbr} S${n}`, `${name} bronchopulmonary segment`, ...(lingula ? ['lingula', 'lingular segment'] : [])],
    layer: 'segment', kind: 'mesh', side: l.side, lobe, code: `S${n}` as const,
    summary: `One of the bronchopulmonary segments of the ${l.label.toLowerCase()}${lingula ? ', in the part of the left upper lobe called the lingula' : ''}.`,
    function: `A subdivision of its lobe. It is ventilated by its own segmental (tertiary) bronchus, B${n}, and supplied with blood by its own artery. Inside it, the airways keep branching into bronchioles and end in the alveoli, where gas exchange happens.`,
    blood: 'not-applicable',
    related: [`${stem}-bronchus`, lobe, LOBAR[lobe]!],
    modelNote: 'Shown as the segment volume from the HuBMAP reference lung. The bronchioles and alveoli inside it are far too small to model.',
    sources: [...LUNG],
  };
});

const bronchusStructures: AnatomicalStructure[] = SEGMENTS.map(([stem, name, lobe, n]) => {
  const l = lobeOf(lobe);
  return {
    id: `${stem}-bronchus`,
    label: `${sideWord(l.side)} ${name.toLowerCase()} bronchus (B${n})`,
    synonyms: [`${l.abbr} B${n}`, `segmental bronchus B${n}`, 'tertiary bronchus'],
    layer: 'airway', kind: 'mesh', side: l.side, lobe, code: `B${n}` as const,
    summary: `The segmental (tertiary) bronchus that ventilates the ${name.toLowerCase()} segment of the ${l.label.toLowerCase()}.`,
    function: 'Carries air between its lobar bronchus and one bronchopulmonary segment. Beyond it the airways divide into bronchioles, which have muscular walls but no cartilage.',
    blood: 'not-applicable',
    related: [`${stem}-segment`, LOBAR[lobe]!],
    sources: [...AIR, 'openstax-lungs'],
  };
});

const lobeStructures: AnatomicalStructure[] = LOBES.map((l) => ({
  id: l.id, label: l.label, synonyms: [l.abbr, `${l.label.toLowerCase()} of lung`],
  layer: 'segment', kind: 'group', side: l.side,
  members: SEGMENTS.filter((s) => s[2] === l.id).map((s) => `${s[0]}-segment`),
  summary: `${l.label} of the lung. The right lung has three lobes and the left lung two.`,
  function: 'A lobe is separated from its neighbours by fissures and is made of several bronchopulmonary segments. It receives air through its own lobar bronchus.',
  blood: 'not-applicable', related: [LOBAR[l.id]!],
  modelNote: 'There is no separate lobe surface: selecting the lobe highlights all of its segments.',
  sources: [...LUNG],
}));

const lobarStructures: AnatomicalStructure[] = LOBES.map((l) => ({
  id: LOBAR[l.id]!,
  label: `${l.label.replace(' lobe', '')} lobar bronchus`,
  synonyms: [`${l.abbr} bronchus`, 'lobar bronchus'],
  layer: 'airway', kind: 'mesh', side: l.side, lobe: l.id,
  summary: `Airway branching from the ${l.side} main bronchus into the ${l.label.toLowerCase()}.`,
  function: 'Carries air to and from one lobe and divides into the segmental bronchi of that lobe. Like the larger airways, it is held open by cartilage.',
  blood: 'not-applicable', related: [`${l.side}-main-bronchus`, l.id],
  sources: [...AIR, 'openstax-lungs'],
}));

export const lungsDefinition: SimulationDefinition = {
  schemaVersion: 1,
  id: 'human-lungs-anatomy',
  title: 'Human Lungs — Interactive 3D Learning Lab',
  domain: 'biology',
  simulationType: '3d-anatomy',
  audience: 'Secondary school (Classes 10–12) and first-year undergraduate biology',
  summary:
    'Explore a 3D adult lung built from the HuBMAP Human Reference Atlas: the larynx, trachea and bronchial tree, the five lobes and twenty bronchopulmonary segments, and watch air move in and out over a breathing cycle.',
  learningObjectives: [
    { id: 'route', text: 'Trace the route air takes from the larynx to the alveoli.' },
    { id: 'lobes', text: 'Name the lobes of each lung and explain why the left lung has two.' },
    { id: 'segments', text: 'Explain what a bronchopulmonary segment is and how it is ventilated.' },
    { id: 'cartilage', text: 'Relate cartilage in the airway walls to keeping the airways open.' },
    { id: 'breathing', text: 'Describe the roles of the diaphragm and intercostal muscles in breathing in and out.' },
  ],
  assets: [{ id: 'hra-lungs-v1', role: 'anatomy-model' }],
  layers: [
    { id: 'segment', label: 'Lungs (lobes & segments)', description: 'The five lobes, each divided into bronchopulmonary segments.', visibleByDefault: true },
    { id: 'airway', label: 'Airways', description: 'Trachea, carina and the bronchial tree down to the segmental bronchi.', visibleByDefault: true },
    { id: 'larynx', label: 'Larynx', description: 'The cartilages of the larynx above the trachea.', visibleByDefault: true },
    { id: 'cartilage', label: 'Airway cartilage', description: 'Cartilage that keeps the trachea and bronchi open.', visibleByDefault: false },
    { id: 'vessel', label: 'Pulmonary vessels', description: 'Pulmonary trunk, pulmonary arteries and pulmonary veins.', visibleByDefault: false },
    { id: 'hilum', label: 'Hilum (lung root)', description: 'Where the airways and vessels enter and leave each lung.', visibleByDefault: false },
  ],
  structures: [
    {
      id: 'right-lung', label: 'Right lung', synonyms: ['right lung'], layer: 'segment', kind: 'group', side: 'right',
      members: SEGMENTS.filter((s) => s[0].startsWith('right')).map((s) => `${s[0]}-segment`),
      summary: 'The right lung, with three lobes: upper, middle and lower.',
      function: 'Takes in air through the right main bronchus and exchanges oxygen and carbon dioxide with the blood in its alveoli.',
      blood: 'not-applicable', related: ['right-upper-lobe', 'right-middle-lobe', 'right-lower-lobe', 'right-main-bronchus'],
      sources: [...LUNG],
    },
    {
      id: 'left-lung', label: 'Left lung', synonyms: ['left lung', 'cardiac notch'], layer: 'segment', kind: 'group', side: 'left',
      members: SEGMENTS.filter((s) => s[0].startsWith('left')).map((s) => `${s[0]}-segment`),
      summary: 'The left lung, with two lobes: upper and lower.',
      function: 'Has only two lobes and a dip on its inner border, the cardiac notch, that makes room for the heart.',
      blood: 'not-applicable', related: ['left-upper-lobe', 'left-lower-lobe', 'left-main-bronchus'],
      sources: [...LUNG],
    },
    ...lobeStructures,
    ...segmentStructures,
    {
      id: 'larynx', label: 'Larynx', synonyms: ['voice box'], layer: 'larynx', kind: 'group', side: 'midline',
      members: ['thyroid-cartilage', 'cricoid-cartilage', 'epiglottis', 'arytenoid-cartilages', 'corniculate-cartilages'],
      summary: 'The cartilaginous structure above the trachea that air passes through.',
      function: 'Its main framework is the thyroid, epiglottic and cricoid cartilages. It holds the vocal cords and, with the epiglottis, keeps food out of the trachea.',
      blood: 'not-applicable', related: ['trachea', 'epiglottis'],
      modelNote: 'Only the cartilages are modelled. The small paired cuneiform cartilages and the vocal cords are not included.',
      sources: [...AIR],
    },
    {
      id: 'thyroid-cartilage', label: 'Thyroid cartilage', synonyms: ["Adam's apple"], layer: 'larynx', kind: 'mesh', side: 'midline',
      summary: 'The largest cartilage of the larynx, forming its front.',
      function: 'One of the three large cartilages that make up the main structure of the larynx.',
      blood: 'not-applicable', related: ['cricoid-cartilage', 'larynx'], sources: [...AIR],
    },
    {
      id: 'cricoid-cartilage', label: 'Cricoid cartilage', synonyms: [], layer: 'larynx', kind: 'mesh', side: 'midline',
      summary: 'Ring-shaped cartilage at the bottom of the larynx, just above the trachea.',
      function: 'One of the three large cartilages that make up the main structure of the larynx.',
      blood: 'not-applicable', related: ['thyroid-cartilage', 'trachea', 'larynx'], sources: [...AIR],
    },
    {
      id: 'epiglottis', label: 'Epiglottis', synonyms: ['epiglottic cartilage'], layer: 'larynx', kind: 'mesh', side: 'midline',
      summary: 'A flexible flap of elastic cartilage at the top of the larynx.',
      function: 'Covers the opening of the trachea. When you swallow, the larynx lifts and the epiglottis swings down, so food and drink go into the oesophagus instead of the airway.',
      blood: 'not-applicable', related: ['larynx', 'trachea'], sources: [...AIR],
    },
    {
      id: 'arytenoid-cartilages', label: 'Arytenoid cartilages', synonyms: ['arytenoids'], layer: 'larynx', kind: 'mesh', side: 'midline',
      summary: 'A pair of small cartilages at the back of the larynx.',
      function: 'Paired cartilages of the larynx that attach to the epiglottis and the vocal cords.',
      blood: 'not-applicable', related: ['corniculate-cartilages', 'larynx'],
      modelNote: 'Left and right are combined into one selectable structure.', sources: [...AIR],
    },
    {
      id: 'corniculate-cartilages', label: 'Corniculate cartilages', synonyms: ['corniculates'], layer: 'larynx', kind: 'mesh', side: 'midline',
      summary: 'A pair of tiny cartilages on top of the arytenoid cartilages.',
      function: 'Paired cartilages of the larynx that attach to the epiglottis and the vocal cords.',
      blood: 'not-applicable', related: ['arytenoid-cartilages', 'larynx'],
      modelNote: 'Left and right are combined into one selectable structure.', sources: [...AIR],
    },
    {
      id: 'trachea', label: 'Trachea', synonyms: ['windpipe'], layer: 'airway', kind: 'mesh', side: 'midline',
      summary: 'The windpipe, running from the larynx down into the chest.',
      function:
        'Carries air between the larynx and the main bronchi. It is held open by 16 to 20 stacked C-shaped rings of hyaline cartilage. The open back of each ring is closed by the trachealis muscle and elastic tissue.',
      blood: 'not-applicable', related: ['tracheal-cartilage', 'carina', 'larynx'], sources: [...AIR],
    },
    {
      id: 'carina', label: 'Carina', synonyms: ['carina of trachea', 'tracheal bifurcation'], layer: 'airway', kind: 'mesh', side: 'midline',
      summary: 'The ridge at the bottom of the trachea, where it divides into the right and left main bronchi.',
      function: 'Contains sensitive nerve tissue. A foreign body touching it sets off a violent cough to expel it.',
      blood: 'not-applicable', related: ['trachea', 'right-main-bronchus', 'left-main-bronchus'], sources: [...AIR],
    },
    {
      id: 'right-main-bronchus', label: 'Right main bronchus', synonyms: ['right primary bronchus'], layer: 'airway', kind: 'mesh', side: 'right',
      summary: 'The airway carrying air from the trachea into the right lung.',
      function: 'Branches into the three lobar bronchi of the right lung. Cartilage rings keep it from collapsing.',
      blood: 'not-applicable', related: ['carina', 'right-upper-lobar-bronchus', 'right-middle-lobar-bronchus', 'right-lower-lobar-bronchus', 'right-main-bronchus-cartilage'],
      sources: [...AIR],
    },
    {
      id: 'left-main-bronchus', label: 'Left main bronchus', synonyms: ['left primary bronchus'], layer: 'airway', kind: 'mesh', side: 'left',
      summary: 'The airway carrying air from the trachea into the left lung.',
      function: 'Branches into the two lobar bronchi of the left lung. Cartilage rings keep it from collapsing.',
      blood: 'not-applicable', related: ['carina', 'left-upper-lobar-bronchus', 'left-lower-lobar-bronchus', 'left-main-bronchus-cartilage'],
      sources: [...AIR],
    },
    ...lobarStructures,
    ...bronchusStructures,
    {
      id: 'tracheal-cartilage', label: 'Tracheal cartilage rings', synonyms: ['C-shaped rings', 'hyaline cartilage'], layer: 'cartilage', kind: 'mesh', side: 'midline',
      summary: 'The C-shaped rings of hyaline cartilage stacked along the trachea.',
      function: 'Keep the trachea open. The rings are joined by dense connective tissue, and their open backs face the oesophagus.',
      blood: 'not-applicable', related: ['trachea'], sources: [...AIR],
    },
    {
      id: 'right-main-bronchus-cartilage', label: 'Cartilage of right main bronchus', synonyms: [], layer: 'cartilage', kind: 'mesh', side: 'right',
      summary: 'Cartilage in the wall of the right main bronchus.', function: 'Keeps the bronchus from collapsing as air pressure changes during breathing.',
      blood: 'not-applicable', related: ['right-main-bronchus'], sources: [...AIR],
    },
    {
      id: 'left-main-bronchus-cartilage', label: 'Cartilage of left main bronchus', synonyms: [], layer: 'cartilage', kind: 'mesh', side: 'left',
      summary: 'Cartilage in the wall of the left main bronchus.', function: 'Keeps the bronchus from collapsing as air pressure changes during breathing.',
      blood: 'not-applicable', related: ['left-main-bronchus'], sources: [...AIR],
    },
    {
      id: 'right-bronchial-cartilage', label: 'Bronchial cartilage (right lung)', synonyms: ['cartilage of lobar bronchi', 'cartilage of segmental bronchi'], layer: 'cartilage', kind: 'mesh', side: 'right',
      summary: 'Cartilage plates in the walls of the lobar and segmental bronchi of the right lung.',
      function: 'Keeps the bronchi open. The bronchioles beyond them have no cartilage, so their diameter can be changed by smooth muscle.',
      blood: 'not-applicable', related: ['right-upper-lobar-bronchus', 'right-lower-lobar-bronchus'],
      modelNote: 'Lobar and segmental bronchial cartilage are combined into one selectable structure per lung.', sources: [...AIR],
    },
    {
      id: 'left-bronchial-cartilage', label: 'Bronchial cartilage (left lung)', synonyms: ['cartilage of lobar bronchi', 'cartilage of segmental bronchi'], layer: 'cartilage', kind: 'mesh', side: 'left',
      summary: 'Cartilage plates in the walls of the lobar and segmental bronchi of the left lung.',
      function: 'Keeps the bronchi open. The bronchioles beyond them have no cartilage, so their diameter can be changed by smooth muscle.',
      blood: 'not-applicable', related: ['left-upper-lobar-bronchus', 'left-lower-lobar-bronchus'],
      modelNote: 'Lobar and segmental bronchial cartilage are combined into one selectable structure per lung.', sources: [...AIR],
    },
    {
      id: 'right-hilum', label: 'Hilum of right lung', synonyms: ['lung root', 'right hilum'], layer: 'hilum', kind: 'mesh', side: 'right',
      summary: 'The region on the inner surface of the right lung where structures enter and leave.',
      function: 'The entry and exit point of the lung: the bronchus, pulmonary vessels and nerves pass through here, and the two layers of the pleura meet here.',
      blood: 'not-applicable', related: ['right-main-bronchus', 'right-pulmonary-artery', 'right-superior-pulmonary-vein'],
      modelNote: 'Shown as the hilum surfaces of the HuBMAP reference lung.', sources: [...LUNG],
    },
    {
      id: 'left-hilum', label: 'Hilum of left lung', synonyms: ['lung root', 'left hilum'], layer: 'hilum', kind: 'mesh', side: 'left',
      summary: 'The region on the inner surface of the left lung where structures enter and leave.',
      function: 'The entry and exit point of the lung: the bronchus, pulmonary vessels and nerves pass through here, and the two layers of the pleura meet here.',
      blood: 'not-applicable', related: ['left-main-bronchus', 'left-pulmonary-artery', 'left-superior-pulmonary-vein'],
      modelNote: 'Shown as the hilum surfaces of the HuBMAP reference lung.', sources: [...LUNG],
    },
    {
      id: 'pulmonary-trunk', label: 'Pulmonary trunk', synonyms: ['main pulmonary artery'], layer: 'vessel', kind: 'mesh', side: 'midline',
      summary: 'The large artery leaving the right ventricle of the heart, which divides into the right and left pulmonary arteries.',
      function: 'Carries oxygen-poor blood from the heart towards the lungs. It is an artery because it carries blood away from the heart.',
      blood: 'oxygen-poor', related: ['right-pulmonary-artery', 'left-pulmonary-artery'], sources: ['openstax-lungs', 'openstax-heart'],
    },
    {
      id: 'right-pulmonary-artery', label: 'Right pulmonary artery', synonyms: ['RPA'], layer: 'vessel', kind: 'mesh', side: 'right',
      summary: 'Branch of the pulmonary trunk carrying blood to the right lung.',
      function: 'Delivers oxygen-poor blood to the right lung, where it picks up oxygen in the capillaries around the alveoli.',
      blood: 'oxygen-poor', related: ['pulmonary-trunk', 'right-hilum'], sources: ['openstax-lungs'],
    },
    {
      id: 'left-pulmonary-artery', label: 'Left pulmonary artery', synonyms: ['LPA'], layer: 'vessel', kind: 'mesh', side: 'left',
      summary: 'Branch of the pulmonary trunk carrying blood to the left lung.',
      function: 'Delivers oxygen-poor blood to the left lung, where it picks up oxygen in the capillaries around the alveoli.',
      blood: 'oxygen-poor', related: ['pulmonary-trunk', 'left-hilum'], sources: ['openstax-lungs'],
    },
    ...(['right-superior', 'right-inferior', 'left-superior', 'left-inferior'] as const).map((v): AnatomicalStructure => {
      const side: Side = v.startsWith('right') ? 'right' : 'left';
      const label = `${sideWord(side)} ${v.endsWith('superior') ? 'superior' : 'inferior'} pulmonary vein`;
      return {
        id: `${v}-pulmonary-vein`, label, synonyms: ['pulmonary veins'], layer: 'vessel', kind: 'mesh', side,
        summary: `One of the veins draining oxygen-rich blood from the ${side} lung.`,
        function: 'Carries oxygen-rich blood from the lung back to the left atrium of the heart. It is a vein because it carries blood towards the heart.',
        blood: 'oxygen-rich', related: [`${side}-hilum`],
        modelNote: 'In the source data the inferior pulmonary veins are named the wrong way round; the side shown here is checked by position.',
        sources: ['openstax-lungs', 'openstax-heart'],
      };
    }),
  ],
  cameraPresets: [
    { id: 'anterior', label: 'Front', direction: [0, 0, 1] },
    { id: 'posterior', label: 'Back', direction: [0, 0, -1] },
    { id: 'left', label: 'Left side', direction: [1, 0, 0] },
    { id: 'right', label: 'Right side', direction: [-1, 0, 0] },
    { id: 'superior', label: 'Top', direction: [0, 1, 0.0001], up: [0, 0, -1] },
    { id: 'inferior', label: 'Bottom', direction: [0, -1, 0.0001], up: [0, 0, 1] },
  ],
  defaultCamera: 'anterior',
  airRoute: {
    id: 'air-route',
    label: 'The route of air',
    description: 'The order in which inhaled air passes through the airways. Breathing out follows the same route in reverse.',
    steps: [
      { offModel: 'outside-air', label: 'Nose or mouth', note: 'Air enters through the nose or mouth and the pharynx (not modelled).' },
      { structure: 'larynx', label: 'Larynx' },
      { structure: 'trachea', label: 'Trachea' },
      { structure: 'carina', label: 'Carina' },
      { structure: 'right-main-bronchus', label: 'Main bronchi' },
      { structure: 'right-upper-lobar-bronchus', label: 'Lobar bronchi' },
      { structure: 'right-apical-bronchus', label: 'Segmental bronchi' },
      { structure: 'right-apical-segment', label: 'Bronchopulmonary segments' },
      { offModel: 'alveoli', label: 'Bronchioles and alveoli', note: 'Too small to model: about 200 µm across, with a respiratory membrane about 0.5 µm thick, where oxygen and carbon dioxide diffuse.' },
    ],
  },
  breathing: {
    defaultRate: 15,
    minRate: 8,
    maxRate: 30,
    inspirationFraction: 1 / 3,
    expansion: 0.05,
    phases: {
      inspiration: 'The diaphragm and the external intercostal muscles contract. The chest gets bigger, pressure in the lungs falls below the air outside, and air flows in.',
      expiration: 'In quiet breathing, expiration is passive: the muscles relax, the elastic lungs recoil, pressure in the lungs rises, and air flows out.',
    },
    assumptions: [
      'Resting adult rate starts at 15 breaths per minute, within the 12–18 range given by the source.',
      'Breathing in takes one third of each breath and breathing out two thirds. This split is a model choice, not a measured value.',
      'The lungs grow by up to 5 % around each hilum to make the movement visible. Real changes in shape are more complex.',
      'Airflow particles show direction and timing only, not real air speed or volume (about 500 mL per quiet breath).',
    ],
    sources: ['openstax-breathing'],
  },
  tour: [
    {
      id: 'larynx', title: 'Into the larynx', camera: 'anterior', focus: ['larynx'], routeStep: 1,
      body: 'Air from the nose and mouth enters the larynx. Its cartilages hold it open, and the epiglottis swings down over the airway when you swallow.',
    },
    {
      id: 'trachea', title: 'Down the trachea', camera: 'anterior', focus: ['trachea', 'tracheal-cartilage'], routeStep: 2,
      body: 'The trachea carries air into the chest. Between 16 and 20 C-shaped rings of cartilage keep it from collapsing, and their open backs are closed by the trachealis muscle.',
    },
    {
      id: 'carina', title: 'The carina', camera: 'anterior', focus: ['carina'], routeStep: 3,
      body: 'At the carina the trachea divides in two. This ridge is very sensitive: anything that touches it triggers a strong cough.',
    },
    {
      id: 'main-bronchi', title: 'Right and left main bronchi', camera: 'anterior', focus: ['right-main-bronchus', 'left-main-bronchus'], routeStep: 4,
      body: 'Each main bronchus carries air into one lung. Like the trachea, its wall is held open by cartilage.',
    },
    {
      id: 'lobes', title: 'Three lobes on the right, two on the left', camera: 'anterior', colourBy: 'lobe',
      focus: ['right-upper-lobe', 'right-middle-lobe', 'right-lower-lobe', 'left-upper-lobe', 'left-lower-lobe'],
      body: 'The right lung has upper, middle and lower lobes. The left lung has only upper and lower lobes, and a notch on its inner edge leaves room for the heart.',
    },
    {
      id: 'lobar-bronchi', title: 'One bronchus for each lobe', camera: 'anterior', routeStep: 5, colourBy: 'lobe',
      focus: ['right-upper-lobar-bronchus', 'right-middle-lobar-bronchus', 'right-lower-lobar-bronchus', 'left-upper-lobar-bronchus', 'left-lower-lobar-bronchus'],
      body: 'Each main bronchus divides into lobar bronchi: three on the right and two on the left, one for every lobe.',
    },
    {
      id: 'segments', title: 'Segments and their bronchi', camera: 'right', focus: ['right-apical-bronchus', 'right-apical-segment'], routeStep: 7, colourBy: 'segment',
      body: 'Each lobe is divided into bronchopulmonary segments, ten in each lung in this model. Every segment has its own segmental (tertiary) bronchus and its own artery. Here is the apical segment of the right upper lobe with its bronchus.',
    },
    {
      id: 'alveoli', title: 'Alveoli and gas exchange', camera: 'anterior', routeStep: 8,
      focus: ['pulmonary-trunk', 'right-pulmonary-artery', 'left-pulmonary-artery', 'right-superior-pulmonary-vein', 'left-superior-pulmonary-vein'],
      body: 'Inside each segment the airways end in millions of tiny alveoli, too small to model. Oxygen diffuses into the blood across a membrane only about 0.5 µm thick. The pulmonary arteries bring oxygen-poor blood, and the pulmonary veins take oxygen-rich blood back to the heart.',
    },
    {
      id: 'breathing', title: 'Breathing in and out', camera: 'anterior', focus: ['right-lung', 'left-lung'], routeStep: 2,
      body: 'Breathing in, the diaphragm and external intercostal muscles contract, the chest enlarges and air flows in. Breathing out at rest is passive: the lungs recoil and air flows out. Watch the airflow reverse.',
    },
  ],
  sources: [
    {
      id: 'openstax-airways',
      citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 22.1 "Organs and Structures of the Respiratory System". Houston: OpenStax; 2022.',
      url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/22-1-organs-and-structures-of-the-respiratory-system',
    },
    {
      id: 'openstax-lungs',
      citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 22.2 "The Lungs". Houston: OpenStax; 2022.',
      url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/22-2-the-lungs',
    },
    {
      id: 'openstax-breathing',
      citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 22.3 "The Process of Breathing". Houston: OpenStax; 2022.',
      url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/22-3-the-process-of-breathing',
    },
    {
      id: 'openstax-heart',
      citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 19.1 "Heart Anatomy". Houston: OpenStax; 2022.',
      url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy',
    },
    {
      id: 'hra-lung',
      citation: 'Browne K, Schlehlein H, et al. 3D Reference Organ for Lung, Female, v1.4. HuBMAP Human Reference Atlas. doi:10.48539/HBM994.HXJP.575',
      url: 'https://doi.org/10.48539/HBM994.HXJP.575',
      license: 'CC BY 4.0',
    },
    {
      id: 'hra-united',
      citation: 'Browne K, Schlehlein H, et al. 3D Reference Organ Set for Female, v1.5. HuBMAP Human Reference Atlas. doi:10.48539/HBM352.BTSQ.586',
      url: 'https://doi.org/10.48539/HBM352.BTSQ.586',
      license: 'CC BY 4.0',
    },
  ],
  disclaimers: [
    'For learning only. This is not a clinical or diagnostic tool, and the explanations have not been reviewed by a physician.',
    'The model is the HuBMAP female reference lung, based on the Visible Human dataset. Real lungs vary in shape, size and branching.',
    'The breathing animation is schematic: the direction and timing of airflow are shown, and the lung movement is simplified.',
  ],
};
