local name = "Agar"

local options = {}

local loadCandidates = {
  "/AGAR/Agar.lua",
  "./AGAR/Agar.lua",
  "AGAR/Agar.lua",
  "/WIDGETS/Agar/Agar.lua",
}
local loadedPath = nil
local TARGET_W = 480
local TARGET_H = 320

local function clearTable(t)
  if type(t) == "table" then
    for i, v in pairs(t) do
      if type(v) == "table" then
        clearTable(v)
      end
      t[i] = nil
    end
  end
  collectgarbage()
  return t
end

local function loadRuntimeScript()
  if loadedPath then
    local ok, script = pcall(dofile, loadedPath)
    if ok and type(script) == "table" then
      return script
    end
  end

  for i = 1, #loadCandidates do
    local path = loadCandidates[i]
    local ok, script = pcall(dofile, path)
    if ok and type(script) == "table" then
      loadedPath = path
      return script
    end
  end

  return {
    init = function() end,
    run = function() lcd.clear() lcd.drawText(10, 10, "Agar.lua not found", BLINK) end,
  }
end

local function create(zone, options)
  local info = loadedPath and fstat(loadedPath) or nil
  local widget = {
    zone = zone,
    options = options,
    w = loadRuntimeScript(),
    time = info and info.time or { sec = -1, min = -1 },
    fs = true
  }
  widget.w.init(TARGET_W, TARGET_H)
  return widget
end

local function update(widget, options)
  widget.options = options
end

local function refresh(widget, event, touch)
  local info = loadedPath and fstat(loadedPath) or nil
  local time = info and info.time or nil
  if time == nil then
    widget.w.run(event, touch)
    return
  end
  if (time.sec ~= widget.time.sec or time.min ~= widget.time.min) then
    print("RELOAD " .. loadedPath)
    widget.time = time
    clearTable(widget.w)
    widget.w = loadRuntimeScript()
    widget.w.init(TARGET_W, TARGET_H)
  end

  widget.w.run(event, touch)
end

return {
  name = name,
  options = options,
  create = create,
  update = update,
  refresh = refresh
}
