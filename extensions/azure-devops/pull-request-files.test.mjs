import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createPullRequestFiles } from "./ui/pull-request-files.mjs";

const dom = new JSDOM("<!doctype html><body></body>");
globalThis.document = dom.window.document;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const snapshot = { iterationId: 3, baseCommit: "base123456", sourceCommit: "source123456", files: [
    { changeTrackingId: 1, path: "/new <script>.txt", originalPath: "/old.txt", changeType: "rename, edit" },
    { changeTrackingId: 2, path: "/other.txt", originalPath: "/other.txt", changeType: "add" },
] };
const rows = [
    { type: "deletion", targetLineNumber: 1, text: "<script>alert(1)</script>" },
    { type: "addition", sourceLineNumber: 1, text: "replacement" },
    ...Array.from({ length: 20 }, (_, i) => ({ type: "context", targetLineNumber: i + 2, sourceLineNumber: i + 2, text: `same ${i}` })),
];

test("files are lazy, safe to render, cached across layouts, filterable and expandable", async () => {
    const calls = [];
    const view = createPullRequestFiles({ webUrl: "https://dev.azure.com/fabrikam/project/_git/repo/pullrequest/42" }, {
        loadChanges: async () => { calls.push("list"); return snapshot; },
        loadFileDiff: async (...args) => { calls.push(args); return { rows, additions: 1, deletions: 1 }; },
    });
    assert.equal(calls.length, 0);
    await view.load();
    assert.deepEqual(calls, ["list"]);
    const first = view.host.querySelector("details");
    first.open = true;
    await settle();
    assert.deepEqual(calls, ["list", [3, 1]]);
    assert.equal(view.host.querySelectorAll("script").length, 0);
    assert.match(first.textContent, /<script>alert/);
    assert.ok(first.querySelector(".pr-file-diff-split"));
    first.querySelector(".pr-diff-fold button").click();
    assert.equal(first.querySelectorAll("tbody tr").length, 21);
    const mode = view.host.querySelector("select");
    mode.value = "unified";
    mode.dispatchEvent(new dom.window.Event("change"));
    assert.ok(first.querySelector(".pr-file-diff-unified"));
    assert.equal(calls.length, 2);
    first.open = false;
    await settle();
    first.open = true;
    await settle();
    assert.equal(calls.length, 2);
    const filter = view.host.querySelector("input");
    filter.value = "other";
    filter.dispatchEvent(new dom.window.Event("input"));
    assert.equal(first.hidden, true);
    assert.equal(view.host.querySelectorAll("details")[1].hidden, false);
    filter.value = "old.txt";
    filter.dispatchEvent(new dom.window.Event("input"));
    assert.equal(first.hidden, false);
});

test("failed file requests retry and binary results explain why no diff is shown", async () => {
    let attempts = 0;
    const view = createPullRequestFiles({}, {
        loadChanges: async () => snapshot,
        loadFileDiff: async () => {
            if (++attempts === 1) throw new Error("Temporary failure");
            return { unavailable: "Binary file" };
        },
    });
    await view.load();
    view.host.querySelector("details").open = true;
    await settle();
    assert.match(view.host.textContent, /Temporary failure/);
    view.host.querySelector(".pr-file-content button").click();
    await settle();
    assert.match(view.host.textContent, /Binary file/);
    assert.equal(attempts, 2);
});

test("list loading can retry and an empty PR is explicit", async () => {
    let attempts = 0;
    const view = createPullRequestFiles({}, {
        loadChanges: async () => {
            if (++attempts === 1) throw new Error("Offline");
            return { ...snapshot, files: [] };
        }, loadFileDiff: async () => { throw new Error("Unexpected file load"); },
    });
    await view.load();
    assert.match(view.host.textContent, /Offline/);
    view.host.querySelector("button").click();
    await settle();
    assert.match(view.host.textContent, /No changed files/);
});
