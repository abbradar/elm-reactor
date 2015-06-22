module SideBar where

import Html exposing (..)
import Html.Attributes exposing (..)
import Json.Encode as Json
import Window

import SideBar.Controls as Controls
import SideBar.Watches as Watches


view
  : Signal.Address Controls.Action
  -> List (String, String)
  -> Controls.Model
  -> Html
view address watchData model =
  div [ sideBarStyle ]
    [ div [ style ["overflow" => "hidden", "height" => "100%"] ]
        [ Controls.view address model
        , Watches.view watchData
        ]
    , div [sideBarTabStyle] []
    ]


(=>) = (,)


darkGrey = "#4e4e4e"
sideBarWidth = 275
tabWidth = 25
px n = toString n ++ "px"


sideBarStyle =
  style
    [ "background" => darkGrey
    , "width" => px sideBarWidth
    , "height" => "100%"
    , "position" => "absolute"
    , "top" => "0px"
    , "right" => "0px"
    , "transitionDuration" => "0.3s"
    , "opacity" => "0.97"
    , "zIndex" => "1"
    ]


sideBarTabStyle =
  style
    [ "position" => "absolute"
    , "width" => px tabWidth
    , "height" => "60px"
    , "top" => "50%"
    , "left" => px -tabWidth
    , "border-top-left-radius" => "3px"
    , "border-bottom-left-radius" => "3px"
    , "background" => darkGrey
    ]


-- SIGNALS

main : Signal Html
main =
  Signal.map2 (view actions.address) watches model


actions : Signal.Mailbox Controls.Action
actions =
  Signal.mailbox Controls.Restart


-- INCOMING PORTS

port watches : Signal (List (String, String))

port model : Signal Controls.Model


-- OUTGOING PORTS

port controls : Signal Json.Value
port controls =
    Signal.map Controls.actionToJson actions.signal

