# @sfmc-bds/module-peace-area

Wave C official SFMC module: **peace-area**（和平区域怪物拦截）.

挂接 `area.registerFeature("peace")`：`entitySpawn` 点查拦截 + `onTick` 兜底清除；铁傀儡 / 雪傀儡 / 友好生物 / 驯服宠物豁免。

## Develop

```bash
npm install
npm run typecheck
npm test
```

Install into platform:

```bash
sfmc mod install peace-area --from dir:. --link
```
