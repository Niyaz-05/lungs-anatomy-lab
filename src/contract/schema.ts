/**
 * The simulation contract (lungs edition). A SimulationDefinition is plain, serialisable data: it
 * names approved assets by id, lists the structures and layers a learner can work with, and
 * declares the learning content (air route, breathing model, tour, objectives). The runtime renders
 * any definition that passes these schemas and the cross-reference checks in validate.ts. Nothing
 * in here may carry a URL (except https source links), a file path or code.
 */
import { z } from 'zod';

/** Lower-case kebab-case ids keep definitions portable and safe to use as DOM/URL keys. */
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lower-case kebab-case').max(64);
const Text = (max: number) => z.string().trim().min(1).max(max);
const Vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const Oxygenation = z.enum(['oxygen-poor', 'oxygen-rich', 'not-applicable']);
export type Oxygenation = z.infer<typeof Oxygenation>;

export const Source = z.object({
  id: Id,
  citation: Text(400),
  url: z.url({ protocol: /^https$/ }).optional(),
  license: Text(80).optional(),
});
export type Source = z.infer<typeof Source>;

export const AssetRef = z.object({
  /** Key into the approved asset registry (assets.ts); never a path or URL. */
  id: Id,
  role: z.enum(['anatomy-model']),
});

export const Layer = z.object({
  id: Id,
  label: Text(60),
  description: Text(300),
  visibleByDefault: z.boolean(),
});
export type Layer = z.infer<typeof Layer>;

export const AnatomicalStructure = z.object({
  id: Id,
  label: Text(80),
  synonyms: z.array(Text(80)).max(12),
  layer: Id,
  /** mesh: a node of the same id exists in the model. group: no geometry; stands for `members`. */
  kind: z.enum(['mesh', 'group']),
  members: z.array(Id).min(2).max(12).optional(),
  side: z.enum(['right', 'left', 'midline']),
  /** Lobe group this structure belongs to, if any. */
  lobe: Id.optional(),
  /** Bronchopulmonary segment number (S1–S10) or segmental bronchus number (B1–B10). */
  code: z.string().regex(/^[SB]([1-9]|10)$/).optional(),
  summary: Text(400),
  function: Text(600),
  blood: Oxygenation,
  related: z.array(Id).max(12),
  /** What the 3D model does and does not show for this structure. */
  modelNote: Text(400).optional(),
  sources: z.array(Id).min(1).max(6),
});
export type AnatomicalStructure = z.infer<typeof AnatomicalStructure>;

export const CameraPreset = z.object({
  id: Id,
  label: Text(40),
  /** Unit-ish vector from the model centre towards the camera, in model axes. */
  direction: Vec3,
  up: Vec3.optional(),
});
export type CameraPreset = z.infer<typeof CameraPreset>;

/** One stage of the route air takes; off-model stages are drawn schematically. */
export const AirStep = z.object({
  structure: Id.optional(),
  offModel: z.enum(['outside-air', 'alveoli']).optional(),
  label: Text(80),
  note: Text(300).optional(),
}).refine((s) => (s.structure === undefined) !== (s.offModel === undefined), {
  message: 'an air step names exactly one of structure or offModel',
});
export type AirStep = z.infer<typeof AirStep>;

export const AirRoute = z.object({
  id: Id,
  label: Text(80),
  description: Text(400),
  steps: z.array(AirStep).min(2).max(40),
});
export type AirRoute = z.infer<typeof AirRoute>;

/** Simplified breathing model. Every number is either cited or listed in `assumptions`. */
export const Breathing = z.object({
  defaultRate: z.number().min(4).max(40),
  minRate: z.number().min(4).max(40),
  maxRate: z.number().min(4).max(60),
  /** Share of each cycle spent breathing in (0–1). */
  inspirationFraction: z.number().gt(0).lt(1),
  /** Peak schematic enlargement of the lung segments (fraction of size). */
  expansion: z.number().min(0).max(0.2),
  phases: z.object({ inspiration: Text(400), expiration: Text(400) }),
  assumptions: z.array(Text(300)).min(1).max(8),
  sources: z.array(Id).min(1).max(6),
});
export type Breathing = z.infer<typeof Breathing>;

export const TourStep = z.object({
  id: Id,
  title: Text(80),
  body: Text(700),
  focus: z.array(Id).max(12),
  camera: Id.optional(),
  /** Air-route step this tour step corresponds to; such steps run the breathing animation. */
  routeStep: z.number().int().min(0).optional(),
  /** Colour mode for this step (the lungs look real unless a step teaches lobes or segments). */
  colourBy: z.enum(['real', 'lobe', 'segment']).optional(),
});
export type TourStep = z.infer<typeof TourStep>;

export const LearningObjective = z.object({ id: Id, text: Text(200) });

export const SimulationDefinition = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  title: Text(100),
  domain: z.enum(['biology']),
  simulationType: z.enum(['3d-anatomy']),
  audience: Text(120),
  summary: Text(500),
  learningObjectives: z.array(LearningObjective).min(1).max(12),
  assets: z.array(AssetRef).min(1).max(4),
  layers: z.array(Layer).min(1).max(16),
  structures: z.array(AnatomicalStructure).min(1).max(200),
  cameraPresets: z.array(CameraPreset).min(1).max(12),
  defaultCamera: Id,
  airRoute: AirRoute,
  breathing: Breathing,
  tour: z.array(TourStep).max(40),
  sources: z.array(Source).min(1).max(40),
  disclaimers: z.array(Text(400)).min(1).max(6),
});
export type SimulationDefinition = z.infer<typeof SimulationDefinition>;
