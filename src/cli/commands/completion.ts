import { Command } from "commander";
import type { SkillRegistry } from "../../skills/registry.js";

function generateBashCompletion(skillNames: string[]): string {
  const skills = skillNames.join(" ");
  return `# dex bash completion
# Add to ~/.bashrc: eval "$(dex completion bash)"
_dex_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local commands="run serve skill config init doctor completion chain ${skills} help"
  local skill_cmds="list info init add remove"
  local config_cmds="list get set"

  case "\${prev}" in
    dex)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    skill)
      COMPREPLY=( $(compgen -W "\${skill_cmds}" -- "\${cur}") )
      return 0
      ;;
    config)
      COMPREPLY=( $(compgen -W "\${config_cmds}" -- "\${cur}") )
      return 0
      ;;
    run)
      COMPREPLY=( $(compgen -W "${skills}" -- "\${cur}") )
      return 0
      ;;
    explain|refactor|test-gen|tg)
      COMPREPLY=( $(compgen -f -- "\${cur}") )
      return 0
      ;;
  esac

  COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
}
complete -F _dex_completions dex
`;
}

function generateZshCompletion(skillNames: string[]): string {
  const skillItems = skillNames.map((s) => `'${s}:Run ${s} skill'`).join("\n      ");
  return `#compdef dex
# dex zsh completion
# Add to ~/.zshrc: eval "$(dex completion zsh)"
_dex() {
  local -a commands=(
    'run:Run a skill by name'
    'serve:Start ACP server'
    'skill:Manage skills'
    'config:Manage configuration'
    'init:Initialize .dex/ in project'
    'doctor:Check system setup'
    'completion:Generate shell completions'
    'chain:Chain skills together'
    ${skillItems}
    'help:Show help'
  )

  local -a skill_cmds=(
    'list:List all skills'
    'info:Show skill details'
    'init:Create new skill'
    'add:Install a skill'
    'remove:Remove a skill'
  )

  local -a config_cmds=(
    'list:Show config'
    'get:Get config value'
    'set:Set config value'
  )

  _arguments -C \\
    '(-v --verbose)'{-v,--verbose}'[Enable verbose output]' \\
    '--json[Output as JSON]' \\
    '(-V --version)'{-V,--version}'[Show version]' \\
    '1: :->cmd' \\
    '*::arg:->args'

  case "\$state" in
    cmd)
      _describe 'command' commands
      ;;
    args)
      case "\$words[1]" in
        skill) _describe 'subcommand' skill_cmds ;;
        config) _describe 'subcommand' config_cmds ;;
        run) _describe 'skill' commands ;;
        explain|refactor|test-gen|tg) _files ;;
      esac
      ;;
  esac
}
_dex
`;
}

function generateFishCompletion(skillNames: string[]): string {
  const skillLines = skillNames
    .map((s) => `complete -c dex -n '__fish_use_subcommand' -a '${s}' -d 'Run ${s} skill'`)
    .join("\n");
  return `# dex fish completion
# Save to ~/.config/fish/completions/dex.fish
complete -c dex -n '__fish_use_subcommand' -a 'run' -d 'Run a skill'
complete -c dex -n '__fish_use_subcommand' -a 'serve' -d 'Start ACP server'
complete -c dex -n '__fish_use_subcommand' -a 'skill' -d 'Manage skills'
complete -c dex -n '__fish_use_subcommand' -a 'config' -d 'Manage config'
complete -c dex -n '__fish_use_subcommand' -a 'init' -d 'Initialize project'
complete -c dex -n '__fish_use_subcommand' -a 'doctor' -d 'Check setup'
complete -c dex -n '__fish_use_subcommand' -a 'completion' -d 'Shell completions'
complete -c dex -n '__fish_use_subcommand' -a 'chain' -d 'Chain skills together'
${skillLines}
complete -c dex -n '__fish_seen_subcommand_from skill' -a 'list info init add remove'
complete -c dex -n '__fish_seen_subcommand_from config' -a 'list get set'
complete -c dex -l verbose -s v -d 'Verbose output'
complete -c dex -l json -d 'JSON output'
`;
}

export function createCompletionCommand(registry: SkillRegistry): Command {
  return new Command("completion")
    .description("Generate shell completion scripts")
    .argument("<shell>", "Shell type: bash, zsh, or fish")
    .action((shell: string) => {
      const skillNames = registry.allNames();

      switch (shell) {
        case "bash":
          console.log(generateBashCompletion(skillNames));
          break;
        case "zsh":
          console.log(generateZshCompletion(skillNames));
          break;
        case "fish":
          console.log(generateFishCompletion(skillNames));
          break;
        default:
          console.error(
            `Unknown shell: ${shell}. Supported: bash, zsh, fish`,
          );
          process.exit(1);
      }
    });
}
