export function shouldPrepareJavaDiagnostics(requestText: string): boolean {
  return /(?:compile error|compilation error|cannot resolve|cannot be resolved|unresolved symbol|unresolved import|missing symbol|diagnostic|diagnostics|javac|type mismatch|method undefined|编译|诊断|找不到符号|无法解析)/i.test(
    requestText
  );
}
