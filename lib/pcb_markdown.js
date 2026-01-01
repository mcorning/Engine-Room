/**
 * Engine Room/lib/pcb_markdown.js
 * rows → markdown (pure presentation)
 */

function dollars(n) {
  return (typeof n === "number" && isFinite(n))
    ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "";
}

module.exports = function pcb_markdown(rows, { dateStr } = {}) {
  const out = [];
  out.push("## PCB");
  if (dateStr) out.push(`- date: \`${dateStr}\``);
  out.push("");

  if (!Array.isArray(rows) || rows.length === 0) {
    out.push("_No bills due in window._");
    out.push("");
    return out.join("\n");
  }

  out.push("| bill | due_date | amount | account | autopay | cycle | source |");
  out.push("| --- | --- | ---: | --- | :---: | --- | --- |");

  for (const r of rows) {
    out.push(
      `| ${r.bill} | ${r.due_date} | ${dollars(r.amount)} | ${r.account || ""} | ${r.autopay ? "✅" : ""} | ${r.cycle || ""} | \`${r.source}\` |`
    );
  }

  out.push("");
  return out.join("\n");
};
