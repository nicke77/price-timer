# node-red-contrib-price-timer

A Node-RED node that plans and controls your energy consumption based on hourly spot prices. Turn on your devices when the electricity is cheapest!

## Key Features

*   **Price-based Scheduling**: Automatically finds the cheapest hours to run your appliances.
*   **Demand Hours**: Specify how many hours your device needs to run per day.
*   **Price Cap**: Set a maximum price you're willing to pay. The device won't run above this price.
*   **Price Level**: If the price stays at or below a level for longer than the requested hours, the device runs for that whole stretch.
*   **Minimum Run Hours**: Ensures your device runs for a minimum number of hours, even if the price is above the cap.
*   **Flexible Control**: Outputs simple on/off commands that can be used with any device control node (e.g., MQTT, Home Assistant, etc.).
*   **Informative Output**: Provides a detailed schedule and cost information for monitoring and logging.

## Installation

You can install this node directly from the Node-RED Palette Manager.

1.  Go to `Menu -> Manage palette`.
2.  Click on the `Install` tab.
3.  Search for `node-red-contrib-price-timer`.
4.  Click `install`.

Alternatively, you can install it via npm in your Node-RED user directory (typically `~/.node-red`):
```bash
npm install node-red-contrib-price-timer
```

## Local development

A Docker Compose setup runs Node-RED with this repository mounted live. It is an **unauthenticated local sandbox**: do not expose the ports on a network, and do not store real home-automation credentials in it. The editor has no password. A credential encryption secret is generated on first start under `docker/data/` and is not committed to git.

```bash
docker compose up --build
```

Then open http://localhost:1880. The first start loads a sample flow on the **price-timer dev** tab. Click the inject node to run `price-timer`. Ports are bound to `127.0.0.1` only.

Edits to `price-timer.js` and `price-timer.html` restart Node-RED automatically. Refresh the editor after a restart so it reloads the node definition. Flows and other runtime data stay in `docker/data/`. The Node.js inspector listens on `127.0.0.1:9229`.

`msg.prices` can be a numeric array, or an object with a `spotprice` array. The array covers one 24-hour day at any resolution (24 samples = hourly, 96 samples = every 15 minutes). **Hours** and **Min. hours** are durations in hours.

## Configuration

The `price-timer` node has the following configuration properties:

*   **Name**: A descriptive name for the node in your flow.
*   **Prices**: A 24-hour price series of any length (starting from 00:00). This is typically passed in via `msg.prices`.
*   **Topic**: The topic for the output message (e.g., `myhome/heating`). Overridden by `msg.topic` when set.
*   **Hours**: The number of hours you want the connected device to be active (wall-clock hours, independent of sample resolution).
*   **On-value**: The value to send when the device should turn on (e.g., `on`, `true`, `1`). Overridden by `msg.startValue` when set.
*   **Off-value**: The value to send when the device should turn off (e.g., `off`, `false`, `0`). Overridden by `msg.stopValue` when set.
*   **Price cap**: The maximum price at which the device is allowed to run, in the same unit as the price series. Leave empty for no cap.
*   **Price level**: If the price stays at or below this level for longer than Hours, the device runs for the whole time it is at or below the level. Leave empty to only run the cheapest Hours. Same unit as the price series. Overridden by `msg.priceLevel` when set.
*   **Min. hours**: The minimum number of hours the device must run, overriding the price cap if necessary.

## Inputs

The node is triggered by an incoming message. The following properties on the `msg` object are used:

*   `msg.prices` (Array | Object): **Required.** A 24-hour price series as a numeric array, or `{ spotprice: [...] }` with that series. Length may be 24 (hourly), 96 (15 minutes), or any other count spanning the same day.
*   `msg.hours` (Number): *Optional.* Overrides the `Hours` configured in the node.
*   `msg.priceCap` (Number): *Optional.* Overrides the `Price cap` configured in the node. Same unit as the price series; omit or leave empty for no cap.
*   `msg.priceLevel` (Number): *Optional.* Overrides the `Price level` configured in the node. If the series is at or below this level for longer than `msg.hours`, every such sample is active. Omit or leave empty to disable.
*   `msg.minHours` (Number): *Optional.* Overrides the `Min. hours` configured in the node.
*   `msg.topic` (String): *Optional.* Overrides the `Topic` configured in the node.
*   `msg.startValue` (*): *Optional.* Overrides the `On-value` configured in the node.
*   `msg.stopValue` (*): *Optional.* Overrides the `Off-value` configured in the node.

## Outputs

The node has two outputs:

1.  **Information Output**: The first output sends a message containing detailed information about the schedule, including:
    *   `msg.payload.prices`: The prices used for calculation.
    *   `msg.payload.nbrOfHours`: The target number of active hours.
    *   `msg.payload.slots`: Indexes into the price series for periods when the device will be active.
    *   `msg.payload.hoursBelowPriceCap`: How many hours of the day are at or below the price cap.
    *   `msg.payload.priceLevel`: The price level used, or `null` when disabled.
    *   `msg.payload.hoursBelowPriceLevel`: How many hours are at or below the price level, or `null` when disabled.
    *   `msg.payload.extended`: `true` when the schedule was lengthened to cover the whole stretch at or below the price level.
    *   `msg.payload.startStop`: A detailed schedule with start and end times.

2.  **Control Output**: The second output sends a message to control your device.
    *   `msg.payload`: Contains the On-value or Off-value (from the message or the node configuration) depending on the current time and schedule.
    *   `msg.topic`: The topic from the message or the node configuration.

## Example Flow

You can create a simple flow to test the node:

1.  Use an `Inject` node to trigger the flow periodically (e.g., every hour).
2.  Connect it to a `Function` node to create a `msg.prices` array covering 24 hours (for example 24 hourly prices, or 96 quarter-hour prices).
3.  Connect the `Function` node to the `price-timer` node.
4.  Configure the `price-timer` with your desired settings (hours, topic, on/off values, etc.).
5.  Connect the second output of the `price-timer` to a `Debug` node to see the on/off commands, or to an `MQTT out` node to control a device.

## Author

Niklas Ekström

## License

MIT
