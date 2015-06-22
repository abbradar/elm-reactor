module Debugger where

import Watches


type alias Model =
    { status : Status
    , events : Array { id:Int, time:Time, value:Json.Value }
    , watches : Watches.Model
    , traces : Traces.Model
    }


type Status
    = Playing
    | Paused { index:Int }


index : Model -> Int
index model =
  case model.status of
    Playing ->
        Array.length model.events

    Paused {index} ->
        index


type Action
    = Pause
    | Play
    | Restart
    | Scrub Int


update action model =
  case action of
    Pause ->
        { model |
            status <- Paused (index model)
        }

    Play ->
        { model |
            status <- Playing,
            events <- Array.slice 0 (index model)
        }

    Restart ->
        init

    Scrub eventNumber ->
        { model |
            status <- Paused eventNumber
        }


