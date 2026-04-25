import os
import sys
import subprocess

# auto-detect SUMO installation on Windows, Linux, and macOS
_default_paths = [
    r"C:\Program Files (x86)\Eclipse\Sumo",
    r"C:\Program Files\Eclipse\Sumo",
    "/usr/share/sumo",
    "/usr/local/share/sumo",
]

SUMO_HOME = os.environ.get("SUMO_HOME", "")
if not SUMO_HOME or not os.path.isdir(SUMO_HOME):
    for p in _default_paths:
        if os.path.isdir(p):
            SUMO_HOME = p
            break

if not SUMO_HOME:
    sys.exit("ERROR: SUMO_HOME is not set and SUMO was not found in default locations.")

NETGENERATE = os.path.join(SUMO_HOME, "bin", "netgenerate.exe")
if not os.path.exists(NETGENERATE):
    NETGENERATE = os.path.join(SUMO_HOME, "bin", "netgenerate")

RANDOM_TRIPS = os.path.join(SUMO_HOME, "tools", "randomTrips.py")

OUTPUT_DIR = os.path.join("..", "sumo_networks")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def generate(grid):
    net = os.path.join(OUTPUT_DIR, f"grid_{grid}x{grid}.net.xml")
    rou = os.path.join(OUTPUT_DIR, f"routes_{grid}x{grid}.rou.xml")
    cfg = os.path.join(OUTPUT_DIR, f"config_{grid}x{grid}.sumocfg")

    print(f"\nGenerating {grid}x{grid} network...")

    if not os.path.exists(NETGENERATE):
        print(f"ERROR: netgenerate not found at {NETGENERATE}")
        return

    if not os.path.exists(RANDOM_TRIPS):
        print(f"ERROR: randomTrips.py not found at {RANDOM_TRIPS}")
        return

    subprocess.run([
        NETGENERATE, "--grid",
        "--grid.number", str(grid),
        "--grid.length", "200",
        "--default.lanenumber", "2",
        "--tls.guess", "true",
        "--output-file", net
    ], check=True)

    print(f"  Network created: {net}")

    subprocess.run([
        "python", RANDOM_TRIPS,
        "-n", net, "-o", rou,
        "-e", "1000", "-p", "2"
    ], check=True)

    print(f"  Routes created: {rou}")

    net_basename = os.path.basename(net)
    rou_basename = os.path.basename(rou)

    with open(cfg, "w") as f:
        f.write(f"""<configuration>
    <input>
        <net-file value="{net_basename}"/>
        <route-files value="{rou_basename}"/>
    </input>
    <time>
        <begin value="0"/>
        <end value="1000"/>
    </time>
</configuration>
""")

    print(f"  Config created: {cfg}")


generate(3)
generate(5)
print("\nAll networks generated successfully!")
