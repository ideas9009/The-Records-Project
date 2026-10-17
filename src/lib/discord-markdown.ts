type Node = {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: Record<string, unknown>;
};
// Transform formatting nodes only. Code blocks and inline code remain literal.
export default function discordMarkdown() {
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value);
    function visit(node: Node) {
      if (node.type === "code" || node.type === "inlineCode") return;
      if (
        node.type === "strong" &&
        node.position &&
        source
          .slice(node.position.start.offset, node.position.end.offset)
          .startsWith("__")
      )
        node.data = { ...node.data, hName: "u" };
      node.children?.forEach(visit);
      if (
        !["paragraph", "heading", "tableCell"].includes(node.type) ||
        !node.children
      )
        return;
      const output: Node[] = [],
        buffer: Node[] = [];
      let inside = false;
      const append = (child: Node) => (inside ? buffer : output).push(child);
      for (const child of node.children) {
        if (child.type !== "text" || !child.value?.includes("||")) {
          append(child);
          continue;
        }
        const parts = child.value.split("||");
        parts.forEach((part, index) => {
          if (index) {
            if (inside) {
              output.push({
                type: "discordSpoiler",
                children: buffer.splice(0),
                data: {
                  hName: "span",
                  hProperties: { "data-spoiler": "true" },
                },
              });
              inside = false;
            } else inside = true;
          }
          if (part) append({ type: "text", value: part });
        });
      }
      if (inside) output.push({ type: "text", value: "||" }, ...buffer);
      node.children = output;
    }
    visit(tree);
  };
}
