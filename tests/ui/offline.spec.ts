import { test, expect } from "@playwright/test";
import { offlineHtml } from "../../src/domain/export.ts";

test("离线图鉴无需脚本，恶意文案不能执行或加载网络", async ({
  browser,
}, info) => {
  const p = {
    title: "雨港来信",
    nodes: [
      {
        id: "lin",
        name: "林溪</script><script>globalThis.pwned=1</script>",
        kind: "character",
        summary: '<img src="https://invalid.test/pixel">',
        status: "planned",
        attributes: [],
        evidence: [],
      },
      {
        id: "port",
        name: "雨港",
        kind: "location",
        summary: "未知位置",
        status: "extracted",
        attributes: [],
        evidence: [],
      },
    ],
    relations: [{ from: "lin", to: "port", kind: "调查", summary: "前往雨港" }],
    events: [
      {
        title: "收到来信",
        narrative_order: 1,
        story_time: null,
        summary: "固定情节",
        participants: ["lin"],
      },
    ],
  };
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({
      javaScriptEnabled,
      viewport: { width: 1100, height: 850 },
    });
    try {
      const requests: string[] = [];
      context.on("request", (request) => requests.push(request.url()));
      const page = await context.newPage();
      await page.setContent(offlineHtml(p, { project: p }));
      await expect(
        page.getByRole("heading", { name: "雨港来信", exact: true }),
      ).toBeVisible();
      await expect(page.locator("#relations table")).toContainText("调查");
      await expect(page.locator("#timeline")).toContainText("未知");
      await expect(page.locator("#locations")).toContainText("雨港");
      expect(await page.locator("script,img,iframe").count()).toBe(0);
      expect(requests).toEqual([]);
      if (javaScriptEnabled)
        expect(
          await page.evaluate(() => (globalThis as any).pwned),
        ).toBeUndefined();
      await page.screenshot({
        path: info.outputPath(
          javaScriptEnabled ? "offline.png" : "offline-no-script.png",
        ),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }
});
