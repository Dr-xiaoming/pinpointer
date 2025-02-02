// app/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "tailwindcss/tailwind.css";
// import { LatLng, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { v4 as uuidv4 } from 'uuid';
import PinnedPoint from "./types/PinnedPoint";
import PinnedPointsList from './components/PinnedPointsList';
import NavigationBar from "./components/NavigationBar";
import PinnedPointsOperationBar from "./components/PinnedPointsOperationBar";
// import "leaflet-arrowheads";
import Group from "./types/Group";
import ManageGroupsModal from "./components/ManageGroupsModal";
import Zone from "./types/Zone";
import type { LatLng, LeafletMouseEvent } from "./types/leaflet-types";  // 移动到类型文件


const MapSection = dynamic(
  () => 
    import("./components/MapSection").then((mod) => {
      if (typeof window !== 'undefined') {
        require('leaflet-geometryutil');
        require('leaflet-arrowheads');
      }
      return mod.default;
    }),
  {
    ssr: false,
  }
);

const Home: React.FC = () => {
  const [pinnedPoints, setPinnedPoints] = useState<PinnedPoint[]>([]);
  const DEFAULT_GROUP = {
    id: "Ungrouped points",
    name: "Ungrouped points",
    color: "#ffffff",
    pinnedPoints: [],
    isVisible: true,
    isSelected: false,
  };
  const [groups, setGroups] = useState<Group[]>([DEFAULT_GROUP]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [draggingPoint, setDraggingPoint] = useState<LatLng | null>(null); // tmp point to display grey pinpoint
  const [currentFile, setCurrentFile] = useState<string>("New Route");
  const [fileList, setFileList] = useState<string[]>(["New Route"]);
  const [isViewOnly, setIsViewOnly] = useState<boolean>(false); // default allow to edit
  const [isEditingFileName, setIsEditingFileName] = useState<boolean>(false);
  const [tempFileName, setTempFileName] = useState<string>("");
  const [isPending, setIsPending] = useState<boolean>(false); 
  const [isManageGroupsModalOpen, setIsManageGroupsModalOpen] = useState(false);
  const [displayNoFlyZone, setDisplayNoFlyZone] = useState(true); // default display no fly zone

  const saveState = () => {
    const state = {
      pinnedPoints,
      groups,
      zones,
      draggingPoint,
      currentFile,
      fileList,
      isViewOnly,
      isManageGroupsModalOpen,
      displayNoFlyZone,
    };
    sessionStorage.setItem("mapState", JSON.stringify(state));
  };

  useEffect(() => {
    const loadState = () => {
      const savedState = sessionStorage.getItem("mapState");
      if (savedState) {
        try {
          const {
            pinnedPoints,
            groups,
            zones,
            draggingPoint,
            currentFile,
            fileList,
            isViewOnly,
            isManageGroupsModalOpen,
            displayNoFlyZone,
          } = JSON.parse(savedState);
  
          setPinnedPoints(pinnedPoints || []);
          setGroups(groups || [DEFAULT_GROUP]);
          setZones(zones || []);
          setDraggingPoint(draggingPoint || null);
          setCurrentFile(currentFile || "New Route");
          setFileList(fileList || ["New Route"]);
          setIsViewOnly(isViewOnly || false);
          setIsManageGroupsModalOpen(isManageGroupsModalOpen || false);
          setDisplayNoFlyZone(displayNoFlyZone || true);
        } catch (error) {
          console.error("Failed to parse saved state:", error);
        }
      }
    };
  
    loadState();
  }, []);

  // init map routes (json file) folder
  useEffect(() => {
    const fetchFiles = async () => {
      const response = await fetch("/api/files");
      if (response.ok) {
        const files = await response.json();
        setFileList(["New Route", ...files]);
      }
    };
    fetchFiles();
  }, []);

  // Handle map click events
  const handleMapClick = (event: LeafletMouseEvent) => {
    if (isViewOnly) return;

    const { lat, lng } = event.latlng;
    const newPoint: PinnedPoint = {
      id: uuidv4(),
      name: `Point ${pinnedPoints.length + 1}`,
      latitude: lat,
      longitude: lng,
      height: 100,
    };
    setPinnedPoints([...pinnedPoints, newPoint]);

    // Directly add the new point to the "Ungrouped points" group
    setGroups((prevGroups) =>
      prevGroups.map((group) =>
        group.id === "Ungrouped points"
          ? {
              ...group,
              pinnedPoints: [...group.pinnedPoints, newPoint],
            }
          : group
      )
    );
  };

  const handleDragStart = (position: LatLng) => {
    setDraggingPoint(position); // set tmp point for grey point
  };

  const handleDragEnd = (id: string, position: LatLng) => {
    setDraggingPoint(null); // remove tmp point for grey point

    if (isViewOnly) return;
    const updatedPoints = pinnedPoints.map((point) =>
      point.id === id
        ? {
            ...point,
            latitude: position.lat,
            longitude: position.lng,
          }
        : point
    );
    setPinnedPoints(updatedPoints);
  };

  const handleDownloadJson = () => {
    // Create a combined data object
    const fileData = JSON.stringify(
      {
        pinnedPoints,
        groups,
      },
      null,
      2 // Indent JSON for readability
    );
    
    const blob = new Blob([fileData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
  
    const link = document.createElement("a");
    link.href = url;
    link.download = "data.json"; // Updated filename to reflect the combined data
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleUploadJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
  
        // Validate JSON structure
        if (Array.isArray(data.pinnedPoints) && Array.isArray(data.groups)) {
          setPinnedPoints(data.pinnedPoints);
          setGroups(data.groups);
        } else {
          alert("Invalid JSON file structure");
        }
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  // load json data from current selected file
  const handleFileSelect = async (fileName: string) => {
    setCurrentFile(fileName);
    if (fileName === "New Route") {
      setPinnedPoints([]);
      setGroups([DEFAULT_GROUP]);
      setZones([]);
    } else {
      const response = await fetch(`/api/files?fileName=${fileName}`);
      if (response.ok) {
        const data = await response.json();
        setPinnedPoints(data.pinnedPoints || []);
        setGroups(data.groups || []);
        setZones(data.zones || []);
      } else {
        alert("Error loading file");
      }
    }
  }; 

  // call back functions
  const handlePointSelect = (point: PinnedPoint) => {
    // Handle point selection
    console.log('Selected point:', point);
  };

  const handlePointRemove = (pointToRemove: PinnedPoint) => {
    setPinnedPoints((prevPoints) =>
      prevPoints.filter((point) => point !== pointToRemove)
    );
  };

  const handlePointUpdate = (updatedPoint: PinnedPoint) => {
    setPinnedPoints((prevPoints) =>
      prevPoints.map((point) => (point.id === updatedPoint.id ? updatedPoint : point))
    );
  };

  const handlePointsReorder = (newPoints: PinnedPoint[]) => {
    setPinnedPoints(newPoints);
  };

  const handleFileEditStart = () => {
    setIsEditingFileName(true);
    setTempFileName(currentFile.replace(/\.json$/, ""));
  };

  const handleFileEditFinish = async (newName: string) => {
    setIsEditingFileName(false);
    newName = newName.trim();
    if (!newName) return;

    if (currentFile === "New Route") {
      const response = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldName: currentFile,
          newName: newName + ".json",
          isPending: true
        })
      });

      if (response.ok) {
        const newFileFullName = newName + ".json";
        setCurrentFile(newFileFullName);
        setTempFileName(newName);
        setIsPending(true);

        setFileList((prev) => {
          const withoutNewRoute = prev.filter((f) => f !== "New Route");
          return [newFileFullName, ...withoutNewRoute];
        });

      } else {
        alert("Error in pending rename.");
      }
    } else {
      const oldName = currentFile;
      const newFileName = newName + ".json";

      if (newFileName === oldName) return;

      const response = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldName,
          newName: newFileName,
          isPending: false
        })
      });

      if (response.ok) {
        setFileList((prev) => {
          const index = prev.indexOf(oldName);
          if (index > -1) {
            const newList = [...prev];
            newList[index] = newFileName;
            return newList;
          }
          return prev;
        });
        setCurrentFile(newFileName);
      } else {
        alert("Error renaming file");
      }
    }
  };

  const generateDefaultFileName = () => {
    const defaultPrefix = "New Route";
    let highestIndex = 0;
    fileList.forEach((file) => {
      const baseName = file.replace(/\.json$/, "");
      const match = baseName.match(new RegExp(`^${defaultPrefix} (\\d+)$`));
      if (match) {
        const index = parseInt(match[1], 10);
        if (index > highestIndex) {
          highestIndex = index;
        }
      }
    });
    return `${defaultPrefix} ${highestIndex + 1}`;
  };

  const handleSave = async () => {
    saveState();

    let oldFileName = currentFile;
    let fileName = "";
    if (oldFileName === "New Route") {
      fileName = generateDefaultFileName() + ".json";
    } else if (isPending) {
      fileName = tempFileName.trim() !== "" ? tempFileName + ".json" : fileName;
    } else {
      fileName = oldFileName;
    }

    const response = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, data: { pinnedPoints, groups, zones } }),
    });

    if (response.ok) {
      if (oldFileName === "New Route") {
        setFileList((prev) => {
          const withoutNewRoute = prev.filter((f) => f !== "New Route" && f !== fileName);
          return ["New Route", ...withoutNewRoute, fileName];
        });

        setCurrentFile(fileName);
      } else if (isPending) {
        setFileList((prev) => {
          const withoutNewRoute = prev.filter((f) => f !== "New Route" && f !== fileName);
          return ["New Route", ...withoutNewRoute, fileName];
        });

        setCurrentFile(fileName);
        setIsPending(false);
      }
    } else {
      alert("Error saving file");
    }
  };

  const toggleViewOnly = () => {
    setIsViewOnly((prev) => !prev);
  };

  const toggleDisplayNoFlyZone = () => {
    setDisplayNoFlyZone((prev) => !prev);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top navigation bar */}
      <NavigationBar
        onDownloadJson={handleDownloadJson}
        onUploadJson={handleUploadJson}
        isViewOnly={isViewOnly}
        toggleViewOnly={toggleViewOnly}
        displayNoFlyZone={displayNoFlyZone}
        toggleDisplayNoFlyZone={toggleDisplayNoFlyZone}
      />
  
      <div className="flex flex-1 overflow-hidden">
        {/* Left section: Map */}
        <MapSection
          pinnedPoints={pinnedPoints}
          groups={groups}
          draggingPoint={draggingPoint}
          isViewOnly={isViewOnly}
          displayNoFlyZone={displayNoFlyZone}
          onMapClick={handleMapClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
  
        {/* Right section */}
        <div className="w-1/3 h-full bg-gray-100 flex flex-col relative">
            <div className="p-4 flex flex-col h-full">
              {/* Operation bar */}
              <PinnedPointsOperationBar
                isEditingFileName={isEditingFileName}
                currentFile={currentFile}
                fileList={fileList}
                handleFileSelect={handleFileSelect}
                handleFileEditStart={handleFileEditStart}
                handleFileEditFinish={handleFileEditFinish}
                handleSave={handleSave}
              />
              <div className="flex-[10] overflow-y-auto min-h-0 bg-gray-50 p-4">
                {pinnedPoints.length === 0 ? (
                  <p>No points pinned yet.</p>
                ) : (
                  <PinnedPointsList
                    points={pinnedPoints}
                    onPointSelect={handlePointSelect}
                    onPointRemove={handlePointRemove}
                    onPointUpdate={handlePointUpdate}
                    onPointsReorder={handlePointsReorder}
                  />
                )}
              </div>

              <div className="flex-[6] overflow-y-auto min-h-0 bg-white p-4 border-t border-gray-300">
                <ManageGroupsModal
                  groups={groups}
                  setGroups={setGroups}
                />
              </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default Home;
