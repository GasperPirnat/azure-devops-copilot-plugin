function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
}

function button(label, action) {
    const node = element("button", "secondary", label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
}

function codeCell(row, side) {
    const cell = element("td", `pr-diff-code ${row ? `pr-diff-${row.type}` : "pr-diff-empty"}`);
    if (row) {
        const sign = row.type === "addition" ? "+" : row.type === "deletion" ? "−" : " ";
        cell.append(element("span", "pr-diff-sign", sign), document.createTextNode(row.text));
        if (row.noNewline) cell.append(element("span", "pr-diff-eof", " ⏎ No newline at end of file"));
    }
    if (side) cell.dataset.side = side;
    return cell;
}

function appendRows(body, rows, mode) {
    if (mode === "unified") {
        for (const row of rows) {
            const tr = element("tr", `pr-diff-${row.type}`);
            tr.append(element("td", "pr-diff-number", row.targetLineNumber || ""),
                element("td", "pr-diff-number", row.sourceLineNumber || ""), codeCell(row));
            body.append(tr);
        }
        return;
    }
    const pair = (left, right) => {
        const tr = element("tr", "");
        tr.append(element("td", "pr-diff-number", left?.targetLineNumber || ""), codeCell(left, "base"),
            element("td", "pr-diff-number", right?.sourceLineNumber || ""), codeCell(right, "source"));
        body.append(tr);
    };
    for (let i = 0; i < rows.length;) {
        if (rows[i].type === "context") {
            pair(rows[i], rows[i]);
            i++;
            continue;
        }
        const removed = [];
        const added = [];
        while (i < rows.length && rows[i].type !== "context") {
            (rows[i].type === "deletion" ? removed : added).push(rows[i++]);
        }
        for (let j = 0; j < Math.max(removed.length, added.length); j++) pair(removed[j], added[j]);
    }
}

function renderDiff(host, diff, mode) {
    host.replaceChildren();
    if (diff.unavailable) {
        host.append(element("p", "status", diff.unavailable));
        return;
    }
    if (diff.simplified) host.append(element("p", "status", "Large change: the changed region is shown as a full replacement; all lines are included."));
    if (!diff.additions && !diff.deletions) host.append(element("p", "status", "No text changes (the file may have been renamed)."));
    const scroll = element("div", "pr-diff-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "File diff");
    const table = element("table", `pr-file-diff pr-file-diff-${mode}`);
    table.setAttribute("aria-label", "Changes from common base to PR source");
    const head = element("thead", "");
    const heading = element("tr", "");
    for (const label of mode === "split" ? ["Line", "Base", "Line", "Source"] : ["Base", "Source", "Change"]) {
        const th = element("th", "", label);
        th.scope = "col";
        heading.append(th);
    }
    head.append(heading);
    const body = element("tbody", "");
    const rows = diff.rows || [];
    for (let i = 0; i < rows.length;) {
        let end = i;
        while (end < rows.length && rows[end].type === "context") end++;
        if (end - i > 8) {
            appendRows(body, rows.slice(i, i + 3), mode);
            const tr = element("tr", "pr-diff-fold");
            const td = element("td", "");
            td.colSpan = mode === "split" ? 4 : 3;
            // Capture the range, since the loop advances before the click.
            const start = i + 3;
            const stop = end - 3;
            td.append(button(`Show ${stop - start} unchanged lines`, () => {
                const expanded = document.createDocumentFragment();
                appendRows(expanded, rows.slice(start, stop), mode);
                tr.replaceWith(expanded);
            }));
            tr.append(td);
            body.append(tr);
            appendRows(body, rows.slice(end - 3, end), mode);
            i = end;
        } else {
            end = Math.max(end, i + 1);
            // Keep adjacent deletions/additions together for side-by-side pairing.
            while (end < rows.length && rows[end].type !== "context") end++;
            appendRows(body, rows.slice(i, end), mode);
            i = end;
        }
    }
    table.append(head, body);
    scroll.append(table);
    host.append(scroll);
}

export function createPullRequestFiles(pr, { loadChanges, loadFileDiff }) {
    const host = element("div", "pr-files");
    const toolbar = element("div", "pr-files-toolbar");
    const count = element("strong", "", "Files changed");
    const filter = element("input", "pr-files-filter");
    filter.type = "search";
    filter.placeholder = "Filter files…";
    filter.setAttribute("aria-label", "Filter changed files");
    const mode = element("select", "");
    mode.setAttribute("aria-label", "Diff layout");
    for (const [value, label] of [["split", "Side by side"], ["unified", "Unified"]]) {
        const option = element("option", "", label);
        option.value = value;
        mode.append(option);
    }
    toolbar.append(count, filter, mode);
    if (pr.webUrl) {
        const link = element("a", "primer-link", "Open in Azure DevOps");
        const url = new URL(pr.webUrl);
        url.searchParams.set("_a", "files");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        toolbar.append(link);
    }
    const comparison = element("p", "pr-files-comparison");
    const list = element("div", "pr-files-list");
    const noMatches = element("p", "status", "No files match this filter.");
    noMatches.hidden = true;
    host.append(toolbar, comparison, list, noMatches);
    const files = [];
    let pending = false;
    let loaded = false;
    const applyFilter = () => {
        const query = filter.value.toLowerCase();
        for (const file of files) file.card.hidden = !`${file.info.path} ${file.info.originalPath}`.toLowerCase().includes(query);
        noMatches.hidden = !files.length || files.some((file) => !file.card.hidden);
    };
    filter.addEventListener("input", applyFilter);
    mode.addEventListener("change", () => {
        for (const file of files) if (file.diff) renderDiff(file.content, file.diff, mode.value);
    });
    async function load() {
        if (pending || loaded) return;
        pending = true;
        list.replaceChildren(element("p", "status", "Loading changed files…"));
        list.setAttribute("aria-busy", "true");
        try {
            const snapshot = await loadChanges();
            comparison.textContent = `All changes · Update ${snapshot.iterationId} · Common base ${snapshot.baseCommit.slice(0, 8)} → source ${snapshot.sourceCommit.slice(0, 8)}`;
            list.replaceChildren();
            count.textContent = `${snapshot.files.length} files changed`;
            if (!snapshot.files.length) list.append(element("p", "status", "No changed files in this pull request."));
            for (const info of snapshot.files) {
                const card = element("details", "pr-file");
                const summary = element("summary", "pr-file-heading");
                const name = info.originalPath !== info.path ? `${info.originalPath} → ${info.path}` : info.path;
                const stats = element("span", "pr-file-stats");
                summary.append(element("span", "pr-file-path", name), element("span", "pr-file-type", info.changeType), stats);
                const content = element("div", "pr-file-content");
                card.append(summary, content);
                const file = { info, card, content, diff: null, pending: false };
                files.push(file);
                async function loadDiff() {
                    if (file.pending || file.diff) return;
                    file.pending = true;
                    content.replaceChildren(element("p", "status", "Loading file diff…"));
                    content.setAttribute("aria-busy", "true");
                    try {
                        file.diff = await loadFileDiff(snapshot.iterationId, info.changeTrackingId);
                        if (!file.diff.unavailable) stats.textContent = `+${file.diff.additions} −${file.diff.deletions}`;
                        renderDiff(content, file.diff, mode.value);
                    } catch (error) {
                        content.replaceChildren(element("p", "status", error.message || "Could not load the file diff."), button("Retry file diff", loadDiff));
                    } finally {
                        file.pending = false;
                        content.removeAttribute("aria-busy");
                    }
                }
                card.addEventListener("toggle", () => { if (card.open) loadDiff(); });
                list.append(card);
            }
            loaded = true;
            applyFilter();
        } catch (error) {
            list.replaceChildren(element("p", "status", error.message || "Could not load changed files."), button("Retry changed files", load));
        } finally {
            pending = false;
            list.removeAttribute("aria-busy");
        }
    }
    return { host, load };
}
