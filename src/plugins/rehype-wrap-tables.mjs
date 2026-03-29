import { visit } from "unist-util-visit";

export default function rehypeWrapTables() {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "table" || !parent || index == null) return;
      if (
        parent.tagName === "div" &&
        parent.properties?.className?.includes("table-wrapper")
      )
        return;

      const wrapper = {
        type: "element",
        tagName: "div",
        properties: { className: ["table-wrapper"] },
        children: [node],
      };

      parent.children[index] = wrapper;
    });
  };
}
