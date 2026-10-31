# Service boundary implementation issues

Published in [Andiewitz/Meshwork-Studio](https://github.com/Andiewitz/Meshwork-Studio)
from the [service boundary audit](../../SERVICE-BOUNDARY-AUDIT.md).
The tracking issue is [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49).
These files preserve the issue bodies; GitHub is authoritative for current
status, discussion, and implementation progress. No runtime changes were made
while filing these issues.

| Audit ID | Issue                                                                                                   | Priority                    |
| -------- | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| SB-01    | [#50 Internal routing and identity client](https://github.com/Andiewitz/Meshwork-Studio/issues/50)      | P1                          |
| SB-02    | [#51 Narrow module APIs](https://github.com/Andiewitz/Meshwork-Studio/issues/51)                        | P1                          |
| SB-03    | [#52 Public contracts and import enforcement](https://github.com/Andiewitz/Meshwork-Studio/issues/52)   | P2                          |
| SB-04    | [#53 Workspace permissions and Team decoupling](https://github.com/Andiewitz/Meshwork-Studio/issues/53) | P1                          |
| SB-05    | [#54 Outbox delivery and claim fencing](https://github.com/Andiewitz/Meshwork-Studio/issues/54)         | P1                          |
| SB-06    | [#55 Canvas consistency and deletion fencing](https://github.com/Andiewitz/Meshwork-Studio/issues/55)   | P1 before Canvas extraction |
| SB-07    | [#56 Module health, drain, and migrations](https://github.com/Andiewitz/Meshwork-Studio/issues/56)      | P2                          |
| SB-08    | [#57 Durable account cleanup](https://github.com/Andiewitz/Meshwork-Studio/issues/57)                   | P2 before account deletion  |
| SB-09    | [#58 Boundary observability](https://github.com/Andiewitz/Meshwork-Studio/issues/58)                    | P2                          |
| SB-10    | [#59 AI process extraction](https://github.com/Andiewitz/Meshwork-Studio/issues/59)                     | P3                          |
| SB-11    | [#60 Canvas SQS/Lambda worker](https://github.com/Andiewitz/Meshwork-Studio/issues/60)                  | P3                          |
| SB-12    | [#61 Optional realtime process](https://github.com/Andiewitz/Meshwork-Studio/issues/61)                 | P3, optional                |

[issues.json](issues.json) records titles, labels, published numbers/URLs, and
dependencies using stable audit IDs. The dependency graph was checked for
missing references and cycles before publication. P1/P2/P3 are engineering
order, not security severity or release dates.

The Canvas issues coordinate with existing [#48](https://github.com/Andiewitz/Meshwork-Studio/issues/48);
they do not commission another competing storage/performance rewrite.
