# H3 packaging continuity: PASS with integration caveat

Observed on macOS arm64 on 2026-08-08. The updated assembler completed the Native-owned test, validate, doctor, build, package, signing, ZIP, and isolated runtime flow with explicit compiled-worker and Prepared Demo inputs. The retained H1 standalone Utility was used as the package fixture; integration must rerun with the verified Focus Sprint app from the current lead branch.

## Results

- The frozen official documentation mirror contains 96 indexed pages, including 48 component pages. Its snapshot SHA-256 is `19b736e496a5eed651a3d63062f16efb8048c77b437b34b7037a4cf5c3a05c72`.
- The captured Native 0.8.1 guidance contains five indexed skills from commit `b21849c`, automation protocol `0x096c8aa4730c11ec`. Its snapshot SHA-256 is `3ffe3336d733015de962607feddf6a583fd36aa757f4b73d44483c07b67f9fc0`.
- The package pins arm64 Node.js 24.18.1, Agent SDK 0.3.226, Native 0.8.1, and Zig 0.16.0. The worker exits cleanly on EOF in an empty environment without a credential, Claude login, Bun, global toolchain, or development checkout.
- The launcher resolves all executables and read-only guidance relative to the app bundle. Persistent registry, generated source, Native SDK state, logs, evidence, and Ready Artifacts live under `Library/Application Support/Replicator`.
- Native 0.8.1 caps individual indexed assets at 16 MiB. The assembler therefore has Native create an unsigned bundle, stages the pinned assets, then invokes `native package --signing adhoc` as the final mutation so Native owns metadata, nested signing, and verification. No `Info.plist` is hand-written and no manual signing occurs.
- Strict deep signing checks passed for the outer app and Prepared Demo. Picker dismissal, four-file selection, overlong-path rejection, and cancellation probes passed.
- The app launched with a minimized bundle-relative environment. Exact credential, checkout, home, and assembly-path scans returned no matches.
- A metadata-preserving ZIP was created with `ditto --sequesterRsrc --keepParent`; the final isolated probe artifact SHA-256 was `ea8e58b00a82f342b0709318f385792bab70bf178c3c74bcd5a8ad4c88488eb7`.

## Integration caveats

`native check --strict` reports 46 warning-level unbound fields, functions, and tags in the integration-owned UI, while Native test, validate, strict doctor, build, package, and signing pass. The lead must rerun the assembler and accessibility automation from the integrated tip with the verified Focus Sprint Prepared Demo; no Agent SDK call was made in this lane.

The retained H1 evidence in `evidence/h1-package-probe/` is unchanged.
