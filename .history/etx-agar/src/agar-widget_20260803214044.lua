local name = "Agar"

local options = {}

local fileToLoad = "./AGAR/Agar.lua"
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

local function create(zone, options)
  local info = fstat(fileToLoad)
  local widget = {
    zone = zone,
    options = options,
    w = dofile(fileToLoad),
    time = info.time,
    fs = true
  }
  widget.w.init(TARGET_W, TARGET_H)
  return widget
end

local function update(widget, options)
  widget.options = options
end

local function refresh(widget, event, touch)
  local info = fstat(fileToLoad)
  local time = info.time
  if (time.sec ~= widget.time.sec or time.min ~= widget.time.min) then
    print("RELOAD " .. fileToLoad)
    widget.time = time
    clearTable(widget.w)
    widget.w = dofile(fileToLoad)
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
