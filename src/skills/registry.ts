import type { LoadedSkill } from "./types.js";
import { SkillNotFoundError } from "../core/errors.js";

export class SkillRegistry {
  private skills = new Map<string, LoadedSkill>();
  private aliases = new Map<string, string>();

  register(skill: LoadedSkill): void {
    this.skills.set(skill.manifest.name, skill);
    if (skill.manifest.aliases) {
      for (const alias of skill.manifest.aliases) {
        this.aliases.set(alias, skill.manifest.name);
      }
    }
  }

  get(name: string): LoadedSkill {
    const resolved = this.aliases.get(name) ?? name;
    const skill = this.skills.get(resolved);
    if (!skill) throw new SkillNotFoundError(name);
    return skill;
  }

  has(name: string): boolean {
    const resolved = this.aliases.get(name) ?? name;
    return this.skills.has(resolved);
  }

  list(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  names(): string[] {
    return Array.from(this.skills.keys());
  }

  allNames(): string[] {
    return [...this.skills.keys(), ...this.aliases.keys()];
  }

  remove(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    if (skill.manifest.aliases) {
      for (const alias of skill.manifest.aliases) {
        this.aliases.delete(alias);
      }
    }
    return this.skills.delete(name);
  }
}
