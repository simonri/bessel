import { describe, expect, it } from "vitest";
import { closestCenter, type DroppableContainer, type ClientRect } from "@dnd-kit/core";
import { collisionDetection } from "./canvas-shell";

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function droppable(id: string, r: ClientRect): DroppableContainer {
  return {
    id,
    key: id,
    disabled: false,
    data: { current: undefined },
    node: { current: null },
    rect: { current: r },
  };
}

describe("canvas collision detection", () => {
  // A tall window dragged from the grid: its rect center sits far below the topbar,
  // near an EmptySlot's center, even while the pointer itself is right over the pill.
  const draggedWindowRect = rect(100, 300, 300, 400); // center: (250, 500)
  const emptySlotRect = rect(100, 300, 300, 400); // same slot the window is leaving — closest by center
  const workspacePillRect = rect(500, 10, 24, 24); // far topbar pill — center: (512, 22)
  const pointerOverPill = { x: 512, y: 22 };

  const droppableRects = new Map<string, ClientRect>([
    ["slot-0", emptySlotRect],
    ["workspace-ws-2", workspacePillRect],
  ]);
  const droppableContainers = [
    droppable("slot-0", emptySlotRect),
    droppable("workspace-ws-2", workspacePillRect),
  ];

  const baseArgs = {
    active: { id: "win-a", data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    collisionRect: draggedWindowRect,
    droppableRects,
    droppableContainers,
  };

  it("plain closestCenter picks the nearby slot, not the pointer's actual target (the bug)", () => {
    const collisions = closestCenter({ ...baseArgs, pointerCoordinates: pointerOverPill });
    expect(collisions[0]?.id).toBe("slot-0");
  });

  it("the composed strategy picks the workspace pill the pointer is actually over", () => {
    const collisions = collisionDetection({ ...baseArgs, pointerCoordinates: pointerOverPill });
    expect(collisions[0]?.id).toBe("workspace-ws-2");
  });

  it("falls back to closestCenter for in-grid reordering when the pointer isn't over any pill", () => {
    const pointerOverSlot = { x: 250, y: 500 };
    const collisions = collisionDetection({ ...baseArgs, pointerCoordinates: pointerOverSlot });
    expect(collisions[0]?.id).toBe("slot-0");
  });
});
