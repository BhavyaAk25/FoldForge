import { polygonCentroid } from "./polygon";
import type { ConnectorV1, Point2Mm } from "./types";

/** Canonical point used to bind a connector to a declared joint anchor. */
export const connectorReferencePoint2 = (connector: ConnectorV1): Point2Mm =>
  connector.kind === "tab"
    ? polygonCentroid(connector.contour.vertices)
    : {
        xMm:
          (connector.centerline.start.xMm + connector.centerline.end.xMm) / 2,
        yMm:
          (connector.centerline.start.yMm + connector.centerline.end.yMm) / 2,
      };
