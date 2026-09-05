import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_EXCLUDE_ENTITIES,
  DEFAULT_TARGET_FAMILIES,
  hasSafeFamily,
  matchesTargetFamily,
  normalizeConfig,
  pointInBox,
  shouldRemoveEntity,
} from "../sapi/src/filter.ts";

describe("peace-area normalizeConfig", () => {
  it("缺省回落到设计默认值", () => {
    const cfg = normalizeConfig(null);
    assert.deepEqual(cfg.target_families, [...DEFAULT_TARGET_FAMILIES]);
    assert.deepEqual(cfg.exclude_entities, [...DEFAULT_EXCLUDE_ENTITIES]);
  });

  it("保留合法覆盖", () => {
    const cfg = normalizeConfig({
      target_families: ["monster", "arthropod"],
      exclude_entities: ["minecraft:iron_golem"],
    });
    assert.deepEqual(cfg.target_families, ["monster", "arthropod"]);
    assert.deepEqual(cfg.exclude_entities, ["minecraft:iron_golem"]);
  });
});

describe("peace-area shouldRemoveEntity", () => {
  const base = {
    targetFamilies: ["monster"],
    excludeEntities: [...DEFAULT_EXCLUDE_ENTITIES],
  };

  it("清除普通怪物", () => {
    assert.equal(
      shouldRemoveEntity({
        ...base,
        typeId: "minecraft:zombie",
        families: ["monster", "zombie", "undead"],
        isPlayer: false,
        isTamed: false,
      }),
      true,
    );
  });

  it("豁免玩家", () => {
    assert.equal(
      shouldRemoveEntity({
        ...base,
        typeId: "minecraft:player",
        families: ["player"],
        isPlayer: true,
        isTamed: false,
      }),
      false,
    );
  });

  it("豁免铁傀儡白名单", () => {
    assert.equal(
      shouldRemoveEntity({
        ...base,
        typeId: "minecraft:iron_golem",
        families: ["mob", "irongolem"],
        isPlayer: false,
        isTamed: false,
      }),
      false,
    );
  });

  it("豁免雪傀儡白名单", () => {
    assert.equal(
      shouldRemoveEntity({
        ...base,
        typeId: "minecraft:snow_golem",
        families: ["mob", "snowgolem"],
        isPlayer: false,
        isTamed: false,
      }),
      false,
    );
  });

  it("豁免驯服宠物", () => {
    assert.equal(
      shouldRemoveEntity({
        ...base,
        typeId: "minecraft:wolf",
        families: ["mob"],
        isPlayer: false,
        isTamed: true,
      }),
      false,
    );
  });

  it("豁免村民友好族群", () => {
    assert.equal(
      shouldRemoveEntity({
        ...base,
        typeId: "minecraft:villager_v2",
        families: ["mob", "villager"],
        isPlayer: false,
        isTamed: false,
      }),
      false,
    );
  });

  it("非目标族群不清除", () => {
    assert.equal(
      shouldRemoveEntity({
        ...base,
        typeId: "minecraft:cow",
        families: ["mob", "animal"],
        isPlayer: false,
        isTamed: false,
      }),
      false,
    );
  });
});

describe("peace-area helpers", () => {
  it("matchesTargetFamily 大小写不敏感", () => {
    assert.equal(matchesTargetFamily(["Monster"], ["monster"]), true);
    assert.equal(matchesTargetFamily(["mob"], ["monster"]), false);
  });

  it("hasSafeFamily", () => {
    assert.equal(hasSafeFamily(["villager"]), true);
    assert.equal(hasSafeFamily(["zombie"]), false);
  });

  it("pointInBox 含边界", () => {
    const box = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
    assert.equal(pointInBox(0, 0, box), true);
    assert.equal(pointInBox(-10, 10, box), true);
    assert.equal(pointInBox(-11, 0, box), false);
  });
});
