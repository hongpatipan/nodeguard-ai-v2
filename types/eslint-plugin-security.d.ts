// eslint-plugin-security ไม่มี type declaration ของตัวเอง — shim ขั้นต่ำแค่พอให้ import ได้แบบ typed
declare module "eslint-plugin-security" {
  const plugin: { rules: Record<string, unknown> };
  export default plugin;
}
