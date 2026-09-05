/**
 * 和平区实体过滤纯逻辑（便于单测）。
 */

/** area 特性插槽 id */
export const FEATURE_ID = "peace";

/** 默认清除族群 */
export const DEFAULT_TARGET_FAMILIES = ["monster"] as const;

/** 配置默认豁免实体 */
export const DEFAULT_EXCLUDE_ENTITIES = [
  "minecraft:iron_golem",
  "minecraft:snow_golem",
] as const;

/**
 * 始终豁免的友好/防卫族群（即使误配进 target_families 也不清除）。
 * 覆盖村民、NPC、铁/雪傀儡等。
 */
export const SAFE_FAMILIES = [
  "villager",
  "npc",
  "irongolem",
  "snowgolem",
  "inanimate",
] as const;

export interface PeaceConfig {
  target_families: string[];
  exclude_entities: string[];
}

export interface EntityFilterInput {
  typeId: string;
  families: readonly string[];
  isPlayer: boolean;
  /** 已驯服宠物 / 坐骑 */
  isTamed: boolean;
  targetFamilies: readonly string[];
  excludeEntities: readonly string[];
}

/** 规范化配置，缺省回落到设计默认值。 */
export function normalizeConfig(raw: unknown): PeaceConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const families = Array.isArray(o.target_families)
    ? o.target_families.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const excludes = Array.isArray(o.exclude_entities)
    ? o.exclude_entities.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  return {
    target_families: families.length > 0 ? families : [...DEFAULT_TARGET_FAMILIES],
    exclude_entities: excludes.length > 0 ? excludes : [...DEFAULT_EXCLUDE_ENTITIES],
  };
}

/** 实体是否命中任一目标族群。 */
export function matchesTargetFamily(
  families: readonly string[],
  targetFamilies: readonly string[],
): boolean {
  if (targetFamilies.length === 0) return false;
  const set = new Set(families.map((f) => f.toLowerCase()));
  return targetFamilies.some((t) => set.has(t.toLowerCase()));
}

/** 实体是否属于始终豁免的友好族群。 */
export function hasSafeFamily(families: readonly string[]): boolean {
  const set = new Set(families.map((f) => f.toLowerCase()));
  return SAFE_FAMILIES.some((f) => set.has(f));
}

/**
 * 判定是否应在和平区内清除该实体。
 * 玩家 / 白名单实体 / 驯服宠物 / 友好族群 → 永不清除；
 * 仅当命中 target_families 时清除。
 */
export function shouldRemoveEntity(input: EntityFilterInput): boolean {
  if (input.isPlayer) return false;
  if (!input.typeId) return false;
  if (input.excludeEntities.includes(input.typeId)) return false;
  if (input.isTamed) return false;
  if (hasSafeFamily(input.families)) return false;
  return matchesTargetFamily(input.families, input.targetFamilies);
}

/** AABB 点包含（XZ，含边界），与 area 引擎一致。 */
export function pointInBox(
  x: number,
  z: number,
  box: { minX: number; minZ: number; maxX: number; maxZ: number },
): boolean {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}
