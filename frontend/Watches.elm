module Watches where


type alias Model =
    Dict String (SparseTimeTree String)


type alias SparseTimeTree a =
    Array



get : Int -> Model -> Dict String String