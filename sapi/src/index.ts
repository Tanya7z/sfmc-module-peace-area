/**
 * @sfmc-bds/module-peace-area — 和平区域怪物拦截
 */

import {
  Entity,
  EntityTypeFamilyComponent,
  Player,
  world,
  type EntitySpawnAfterEvent,
} from "@minecraft/server";
import { config } from "@sfmc-bds/sdk/sapi/config";
import { ModuleRegistry } from "@sfmc-bds/sdk/module-loader";
import { debug } from "@sfmc-bds/sdk/sapi/runtime";
import { service } from "@sfmc-bds/sdk/sapi/service";
import {
  FEATURE_ID,
  normalizeConfig,
  pointInBox,
  shouldRemoveEntity,
  type PeaceConfig,
} from "./filter.js";

const MODULE_ID = "peace-area";

/** area.onTick 上下文（与上游 AreaContext 对齐的最小形状）。 */
interface AreaTickContext {
  name: string;
  dimension: string;
  box: { minX: number; minZ: number; maxX: number; maxZ: number };
  params: Record<string, unknown>;
}

const eventCleanups: Array<() => void> = [];
let peaceConfig: PeaceConfig = normalizeConfig(null);

/** 读取实体族群；组件缺失时返回空数组。 */
function readFamilies(entity: Entity): string[] {
  try {
    const comp = entity.getComponent(EntityTypeFamilyComponent.componentId) as
      EntityTypeFamilyComponent | undefined;
    if (!comp) return [];
    return comp.getTypeFamilies();
  } catch {
    return [];
  }
}

/** 是否已驯服（宠物 / 可驯服坐骑）。 */
function readIsTamed(entity: Entity): boolean {
  try {
    const tameable = entity.getComponent("minecraft:tameable") as
      { isTamed?: boolean } | undefined;
    if (tameable?.isTamed) return true;
  } catch {
    /* ignore */
  }
  try {
    const mount = entity.getComponent("minecraft:tamemount") as
      { isTamed?: boolean } | undefined;
    if (mount?.isTamed) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** 统一判定并安全 remove。 */
function tryRemoveIfHostile(entity: Entity): boolean {
  if (!entity.isValid) return false;
  const isPlayer =
    entity instanceof Player || entity.typeId === "minecraft:player";
  const remove = shouldRemoveEntity({
    typeId: entity.typeId,
    families: readFamilies(entity),
    isPlayer,
    isTamed: readIsTamed(entity),
    targetFamilies: peaceConfig.target_families,
    excludeEntities: peaceConfig.exclude_entities,
  });
  if (!remove) return false;
  try {
    entity.remove();
    return true;
  } catch (err) {
    debug.w(
      "PeaceArea",
      `remove ${entity.typeId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/** 生成拦截：点查是否处于声明了 peace 的区域。 */
async function onEntitySpawn(ev: EntitySpawnAfterEvent): Promise<void> {
  const entity = ev.entity;
  if (!entity?.isValid) return;
  if (entity instanceof Player || entity.typeId === "minecraft:player") return;

  // 先做廉价过滤，避免对非目标实体发起 byPoint
  const preview = shouldRemoveEntity({
    typeId: entity.typeId,
    families: readFamilies(entity),
    isPlayer: false,
    isTamed: readIsTamed(entity),
    targetFamilies: peaceConfig.target_families,
    excludeEntities: peaceConfig.exclude_entities,
  });
  if (!preview) return;

  try {
    const loc = entity.location;
    const hit = await service.call("area.byPoint", {
      dimension: entity.dimension.id,
      x: loc.x,
      z: loc.z,
      feature: FEATURE_ID,
    });
    if (!hit) return;
    tryRemoveIfHostile(entity);
  } catch (err) {
    debug.w(
      "PeaceArea",
      `entitySpawn: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** onTick 兜底：扫描区域内存活实体。 */
function sweepPeaceArea(ctx: AreaTickContext): void {
  let dim;
  try {
    dim = world.getDimension(ctx.dimension);
  } catch {
    debug.w("PeaceArea", `未知维度 ${ctx.dimension}`);
    return;
  }

  let entities: Entity[] = [];
  try {
    // 按目标族群查询，再以 AABB 收窄
    for (const family of peaceConfig.target_families) {
      const batch = dim.getEntities({ families: [family] });
      entities = entities.concat(batch);
    }
  } catch (err) {
    debug.w(
      "PeaceArea",
      `getEntities@${ctx.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const seen = new Set<string>();
  for (const entity of entities) {
    if (!entity.isValid) continue;
    if (seen.has(entity.id)) continue;
    seen.add(entity.id);
    const { x, z } = entity.location;
    if (!pointInBox(x, z, ctx.box)) continue;
    tryRemoveIfHostile(entity);
  }
}

async function loadConfig(): Promise<void> {
  const families = await config.get("target_families");
  const excludes = await config.get("exclude_entities");
  peaceConfig = normalizeConfig({
    target_families: families,
    exclude_entities: excludes,
  });
}

ModuleRegistry.register({
  id: MODULE_ID,
  afterWorldLoad: true,
  lifecycle: {
    registerPermissions() {
      // 无玩家命令面
    },
    registerEvents() {
      const cb = world.afterEvents.entitySpawn.subscribe((ev) => {
        void onEntitySpawn(ev);
      });
      eventCleanups.push(() => {
        try {
          world.afterEvents.entitySpawn.unsubscribe(cb);
        } catch {
          /* ignore */
        }
      });
    },
    async init() {
      await loadConfig();
      config.onChange((key) => {
        if (key === "target_families" || key === "exclude_entities") {
          void loadConfig();
        }
      });

      // area 在 init 阶段 provide；本模块同样 afterWorldLoad，此处挂接特性插槽
      try {
        const result = (await service.call("area.registerFeature", {
          id: FEATURE_ID,
          handler: {
            id: FEATURE_ID,
            onTick(ctx: AreaTickContext) {
              sweepPeaceArea(ctx);
            },
          },
        })) as { ok?: boolean } | undefined;
        if (result && result.ok === false) {
          debug.w("PeaceArea", "area.registerFeature 返回 ok=false");
        } else {
          debug.i(
            "PeaceArea",
            `init feature=${FEATURE_ID} families=${peaceConfig.target_families.join(",")}`,
          );
        }
      } catch (err) {
        debug.e(
          "PeaceArea",
          "area.registerFeature 失败",
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    },
    cleanup() {
      for (const c of eventCleanups.splice(0, eventCleanups.length)) c();
      peaceConfig = normalizeConfig(null);
      debug.i("PeaceArea", "cleanup");
    },
  },
});
