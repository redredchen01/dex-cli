#!/usr/bin/env tsx
/**
 * @fileoverview Auto-add JSDoc comments to TypeScript files
 * Usage: npx tsx scripts/add-jsdoc.ts src/**/*.ts
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

// Parse function signature
function extractFunctionInfo(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction, sourceFile: ts.SourceFile) {
  const name = (node as any).name?.getText(sourceFile) || "anonymous";
  const params: string[] = [];
  
  node.parameters.forEach(param => {
    const paramName = param.name.getText(sourceFile);
    const paramType = param.type?.getText(sourceFile) || "any";
    params.push(`@param {${paramType}} ${paramName}`);
  });
  
  const returnType = (node as any).type?.getText(sourceFile);
  const returns = returnType ? `@returns {${returnType}}` : "";
  
  return { name, params, returns };
}

// Generate JSDoc
function generateJSDoc(funcInfo: { name: string; params: string[]; returns: string }) {
  const lines = ["/**", ` * TODO: Add description for ${funcInfo.name}`];
  
  funcInfo.params.forEach(p => {
    lines.push(` * ${p} - TODO: describe`);
  });
  
  if (funcInfo.returns) {
    lines.push(` * ${funcInfo.returns} TODO: describe`);
  }
  
  lines.push(" */");
  return lines.join("\n");
}

// Process single file
function processFile(filePath: string) {
  const sourceCode = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );
  
  const edits: { pos: number; text: string }[] = [];
  
  ts.forEachChild(sourceFile, function visit(node) {
    // Check for existing JSDoc
    const hasExisting = (node as any).jsDoc && (node as any).jsDoc.length > 0;
    
    if (!hasExisting && (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))) {
      if ((node as any).name) {
        const info = extractFunctionInfo(node, sourceFile);
        const jsdoc = generateJSDoc(info);
        edits.push({ pos: node.getStart(sourceFile), text: jsdoc + "\n" });
      }
    }
    
    ts.forEachChild(node, visit);
  });
  
  // Apply edits in reverse order to maintain positions
  let newCode = sourceCode;
  edits.sort((a, b) => b.pos - a.pos);
  edits.forEach(edit => {
    newCode = newCode.slice(0, edit.pos) + edit.text + newCode.slice(edit.pos);
  });
  
  if (edits.length > 0) {
    fs.writeFileSync(filePath, newCode);
    console.log(`✓ Added ${edits.length} JSDoc blocks to ${path.basename(filePath)}`);
  }
}

// Main
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log("Usage: npx tsx add-jsdoc.ts <file-pattern>");
  process.exit(1);
}

files.forEach(f => {
  if (fs.existsSync(f) && f.endsWith(".ts") && !f.endsWith(".d.ts")) {
    processFile(f);
  }
});
